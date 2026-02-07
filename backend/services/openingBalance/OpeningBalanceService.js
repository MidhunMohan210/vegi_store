// services/OpeningBalanceService.js
import mongoose from "mongoose";
import YearOpeningAdjustment from "../../model/YearOpeningAdjustmentModel.js";
import AccountMonthlyBalance from "../../model/AccountMonthlyBalanceModel.js";
import CompanySettings from "../../model/CompanySettings.model.js";
import AccountMaster from "../../model/masters/AccountMasterModel.js";
import AdjustmentEntryModel from "../../model/AdjustmentEntryModel.js";

const OpeningBalanceService = {
/**
 * Get year-wise opening balances with adjustments
 */
getYearWiseBalances: async (entityId, entityType, companyId, branchId) => {
  try {
    // 1. Get Settings (Start Month)
    const settings = await CompanySettings.findOne({ company: companyId });
    let startMonth = 4; // Default to April
    if (settings?.financialYear?.startDate) {
      startMonth = new Date(settings.financialYear.startDate).getMonth() + 1;
    }

    // 2. Fetch Master Record
    let masterOpening = 0;
    let masterCreatedAt = new Date();

    if (entityType === "party") {
      const master = await AccountMaster.findById(entityId).lean();
      if (master) {
        masterOpening = master.openingBalance || 0;
        masterCreatedAt = master.createdAt || new Date();
      }
    }

    // 3. Fetch Monthly Balances
    const monthlyBalances = await AccountMonthlyBalance.find({
      account: entityId,
      company: companyId,
      branch: branchId,
    }).sort({ year: 1, month: 1 }).lean();

    // 4. Fetch Year Opening Adjustments
    const adjustments = await YearOpeningAdjustment.find({
      entityId,
      entityType,
      isCancelled: false,
    }).lean();

    // 🔥 NEW: Fetch Pending Transaction Adjustments (Not Yet Reversed)
    const pendingAdjustments = await AdjustmentEntryModel.find({
      affectedAccount: entityId,
      branch: branchId,
      isReversed: false,
      status: 'active'
    }).lean();

    // Group pending adjustments by Financial Year
    const pendingByFY = new Map();
    
    pendingAdjustments.forEach(adj => {
      const txnDate = new Date(adj.originalTransactionDate);
      const txnMonth = txnDate.getMonth() + 1;
      const txnYear = txnDate.getFullYear();
      
      // Determine which FY this transaction belongs to
      const fy = txnMonth >= startMonth ? txnYear : txnYear - 1;
      const fyLabel = fy.toString();
      
      if (!pendingByFY.has(fyLabel)) pendingByFY.set(fyLabel, 0);
      
      // Add the delta (can be positive or negative)
      pendingByFY.set(fyLabel, pendingByFY.get(fyLabel) + (adj.amountDelta || 0));
    });

    console.log("Pending Adjustments by FY:", Array.from(pendingByFY.entries()));

    // 5. Determine Start Year
    let minYear;
    if (monthlyBalances.length > 0) {
      const firstMb = monthlyBalances[0];
      minYear = firstMb.month >= startMonth ? firstMb.year : firstMb.year - 1;
    } else {
      const createdMonth = masterCreatedAt.getMonth() + 1;
      const createdYear = masterCreatedAt.getFullYear();
      minYear = createdMonth >= startMonth ? createdYear : createdYear - 1;
    }

    // Current FY
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYearVal = currentDate.getFullYear();
    const currentFY = currentMonth >= startMonth ? currentYearVal : currentYearVal - 1;
    const maxYear = Math.max(minYear, currentFY);

    // 6. Build Chain
    const fyMap = new Map();
    monthlyBalances.forEach((mb) => {
      let fyLabel = mb.month >= startMonth ? mb.year.toString() : (mb.year - 1).toString();
      if (!fyMap.has(fyLabel)) fyMap.set(fyLabel, { financialYear: fyLabel, months: [] });
      fyMap.get(fyLabel).months.push(mb);
    });

    const resultChain = [];

    for (let y = minYear; y <= maxYear; y++) {
      const fyStr = y.toString();
      const yearData = fyMap.get(fyStr);
      const adjustment = adjustments.find((a) => a.financialYear === fyStr);
      const pendingDelta = pendingByFY.get(fyStr) || 0; // 🔥 Get pending adjustment

      let node = {
        financialYear: fyStr,
        source: "carryForward",
        openingBalance: 0,
        adjustment: null,
        effectiveOpening: 0,
        closingBalance: null,
        isLocked: y < currentFY - 1,
        isCurrent: y === currentFY,
        pendingAdjustment: pendingDelta // 🔥 Add this for debugging/display
      };

      // --- OPENING BALANCE LOGIC ---
      if (y === minYear) {
        node.source = "master";
        node.openingBalance = masterOpening;
      } else {
        const prevNode = resultChain[resultChain.length - 1];
        node.openingBalance = prevNode ? (prevNode.closingBalance || prevNode.effectiveOpening) : 0;
      }

      // --- YEAR ADJUSTMENT LOGIC ---
      if (adjustment) {
        node.adjustment = adjustment.adjustmentAmount;
        node.effectiveOpening = node.openingBalance + adjustment.adjustmentAmount;
      } else {
        node.effectiveOpening = node.openingBalance;
      }

      // --- CLOSING BALANCE LOGIC (Include Pending Adjustments) ---
      if (yearData && yearData.months.length > 0) {
        yearData.months.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });
        
        // 🔥 Add pending adjustments to the last closing balance
        node.closingBalance = yearData.months[yearData.months.length - 1].closingBalance + pendingDelta;
      } else {
        if (y <= currentFY) {
          // 🔥 If no monthly data but has pending adjustments, apply them
          node.closingBalance = node.effectiveOpening + pendingDelta;
        }
      }

      resultChain.push(node);
    }

    return resultChain;

  } catch (error) {
    throw new Error(`Error: ${error.message}`);
  }
},


  /**
   * Save adjustment and trigger recalculation
   */
  saveAdjustment: async ({
    entityId,
    entityType,
    financialYear,
    adjustmentAmount,
    reason,
    userId,
    companyId,
    branchId,
  }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Upsert Adjustment Record
      let adjustment = await YearOpeningAdjustment.findOne({
        entityId,
        entityType,
        financialYear,
        isCancelled: false,
      }).session(session);

      if (adjustment) {
        adjustment.adjustmentAmount = adjustmentAmount;
        adjustment.reason = reason;
        adjustment.updatedBy = userId;
        await adjustment.save({ session });
      } else {
        adjustment = new YearOpeningAdjustment({
          entityId,
          entityType,
          financialYear,
          adjustmentAmount,
          reason,
          createdBy: userId,
        });
        await adjustment.save({ session });
      }

      // 2. Trigger Recalculation
      const startMonth = 4; // Should come from settings
      const startYear = parseInt(financialYear);

      await OpeningBalanceService.recalculateLedger(
        entityId,
        branchId,
        companyId,
        startMonth,
        startYear,
        session,
      );

      await session.commitTransaction();
      return adjustment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },

  /**
   * Recalculate Ledger Chain (Placeholder)
   */
  recalculateLedger: async (
    accountId,
    branchId,
    companyId,
    startMonth,
    startYear,
    session,
  ) => {
    // This part will contain the logic to update monthly balances
    // Will implement this next if needed
    console.log("Recalculating from", startMonth, startYear);
  },
};

export default OpeningBalanceService;
