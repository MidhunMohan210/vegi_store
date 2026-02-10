// services/OpeningBalanceService.js
import mongoose from "mongoose";
import YearOpeningAdjustment from "../../model/YearOpeningAdjustmentModel.js";
import AccountMonthlyBalance from "../../model/AccountMonthlyBalanceModel.js";
import CompanySettings from "../../model/CompanySettings.model.js";
import AccountMaster from "../../model/masters/AccountMasterModel.js";
import AdjustmentEntryModel from "../../model/AdjustmentEntryModel.js";
import Company from "../../model/masters/CompanyModel.js";
import { getFinancialYearForDate } from "../../helpers/CommonTransactionHelper/openingBalanceHelper.js";
import { transactionModelToType } from "../../helpers/transactionHelpers/transactionMappers.js";

const PAGE_SIZE = 5;

// Helper: get FY label (number) for a given Date and FY startMonth

const OpeningBalanceService = {
  getYearWiseBalances: async (
    entityId,
    entityType,
    companyId,
    branchId,
    page = 1,
  ) => {
    try {
      console.log("🔹 getYearWiseBalances:", {
        entityId,
        entityType,
        companyId,
        branchId,
        page,
      });

      // 1. Load settings + company (for FY config)
      const [settings, company] = await Promise.all([
        CompanySettings.findOne({ company: companyId }),
        Company.findById(companyId).lean(),
      ]);

      const fyConfig = company?.financialYear || {};

      // FY start month from Company (locked), fallback to 4 (April)
      let startMonth = fyConfig.startMonth || 4;
      const endMonth = fyConfig.endMonth || ((startMonth + 11 - 1) % 12) + 1;

      const startingYear = fyConfig.startingYear || 2000;

      console.log("📆 FY Config:", {
        startMonth,
        endMonth,
        startingYear,
      });

      // 2. Master record
      let masterOpening = 0;
      let masterCreatedAt = new Date();

      if (entityType === "party") {
        const master = await AccountMaster.findById(entityId).lean();
        console.log("🔹 AccountMaster:", {
          id: master?._id,
          openingBalance: master?.openingBalance,
          createdAt: master?.createdAt,
        });

        if (master) {
          masterOpening = master.openingBalance || 0;
          masterCreatedAt = master.createdAt || new Date();
        }
      }

      // 3. Monthly balances
      const monthlyBalances = await AccountMonthlyBalance.find({
        account: entityId,
        company: companyId,
        branch: branchId,
      })
        .sort({ year: 1, month: 1 })
        .lean();

      console.log(
        `📊 MonthlyBalances count: ${monthlyBalances.length}`,
        monthlyBalances.map((m) => ({
          year: m.year,
          month: m.month,
          openingBalance: m.openingBalance,
          closingBalance: m.closingBalance,
        })),
      );

      // 4. Year opening adjustments
      const adjustments = await YearOpeningAdjustment.find({
        entityId,
        entityType,
        isCancelled: false,
      }).lean();

      console.log(
        `📌 YearOpeningAdjustments count: ${adjustments.length}`,
        adjustments.map((a) => ({
          financialYear: a.financialYear,
          adjustmentAmount: a.adjustmentAmount,
        })),
      );

      // 5. Pending AdjustmentEntry deltas (not yet pushed to ledger)
      // 5. Pending AdjustmentEntry deltas (not yet pushed to ledger)
      const pendingAdjustments = await AdjustmentEntryModel.find({
        affectedAccount: entityId,
        branch: branchId,
        isReversed: false,
        status: "active",
      }).lean();

      console.log(
        `🧾 PendingAdjustmentEntries count: ${pendingAdjustments.length}`,
        pendingAdjustments.map((p) => ({
          originalTransactionDate: p.originalTransactionDate,
          amountDelta: p.amountDelta,
          voucherType: p.voucherType,
        })),
      );

      const pendingByFY = new Map();
      pendingAdjustments.forEach((adj) => {
        const d = new Date(adj.originalTransactionDate);
        const fy = getFinancialYearForDate(d, startMonth);
        const k = fy.toString();

        // Get voucher type from model name
        const voucherType = transactionModelToType(
          adj.originalTransactionModel,
        );

        console.log("voucherType", voucherType);
        

        // Determine sign based on voucher type
        const crVouchers = ["purchase", "sales_return", "receipt"];

        let signedDelta = adj.amountDelta || 0;

        console.log("signedDelta", signedDelta);
        

        if (crVouchers.includes(voucherType)) {
          signedDelta = -(signedDelta);
        } else {
          signedDelta = signedDelta;
        }

        if (!pendingByFY.has(k)) pendingByFY.set(k, 0);
        pendingByFY.set(k, pendingByFY.get(k) + signedDelta);
      });

      console.log(
        "🧾 PendingByFY:",
        Array.from(pendingByFY.entries()).map(([fy, delta]) => ({
          financialYear: fy,
          pendingDelta: delta,
        })),
      );

      // 6. Determine current FY (no future tns allowed)
      const now = new Date();
      const currentFY = getFinancialYearForDate(now, startMonth);

      console.log("📆 Current:", {
        now,
        currentFY,
      });

      // 7. Build FY -> months map from monthlyBalances using FY rules
      const fyMap = new Map();
      monthlyBalances.forEach((mb) => {
        const d = new Date(mb.year, mb.month - 1, 1);
        const fyLabel = getFinancialYearForDate(d, startMonth).toString();

        if (!fyMap.has(fyLabel))
          fyMap.set(fyLabel, { financialYear: fyLabel, months: [] });
        fyMap.get(fyLabel).months.push(mb);
      });

      console.log("📊 FY Map keys:", Array.from(fyMap.keys()));

      // 8. Build list of all FYs in scope [startingYear .. currentFY]
      const allFYs = [];
      for (let y = startingYear; y <= currentFY; y++) {
        allFYs.push(y);
      }
      allFYs.reverse(); // [currentFY, ..., startingYear]

      console.log("📆 All FYs (desc):", allFYs);

      // 9. Pagination
      const totalYears = allFYs.length;
      const totalPages = Math.max(1, Math.ceil(totalYears / PAGE_SIZE));
      const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);

      const startIndex = (safePage - 1) * PAGE_SIZE;
      const pageFYs = allFYs.slice(startIndex, startIndex + PAGE_SIZE);

      console.log("📄 Pagination:", {
        requestedPage: page,
        safePage,
        pageSize: PAGE_SIZE,
        totalYears,
        totalPages,
        pageFYs,
      });

      // 10. Build FULL chain from startingYear to max year on this page
      const maxPageFY = Math.max(...pageFYs);
      const allFYsForChain = [];
      for (let y = startingYear; y <= maxPageFY; y++) {
        allFYsForChain.push(y);
      }

      console.log("📆 allFYsForChain (for chaining):", allFYsForChain);

      const resultChain = [];
      let previousClosing = null;

      for (const y of allFYsForChain) {
        const fyStr = y.toString();
        const yearData = fyMap.get(fyStr);
        const adjustment = adjustments.find((a) => a.financialYear === fyStr);
        const pendingDelta = pendingByFY.get(fyStr) || 0;

        console.log("🔸 Processing FY:", {
          fyStr,
          hasYearData: !!yearData,
          monthsCount: yearData?.months?.length || 0,
          adjustmentAmount: adjustment?.adjustmentAmount || 0,
          pendingDelta,
          previousClosing,
        });

        const node = {
          financialYear: fyStr,
          source: "carryForward",
          openingBalance: 0,
          adjustment: null,
          effectiveOpening: 0,
          closingBalance: null,
          isLocked: false,
          isCurrent: y === currentFY,
          pendingAdjustment: pendingDelta,
        };

        // --- OPENING BALANCE ---
        if (y === startingYear) {
          node.source = "master";
          node.openingBalance = masterOpening;
          console.log(`  ▶ FY ${fyStr}: opening from master ${masterOpening}`);
        } else if (previousClosing !== null) {
          node.openingBalance = previousClosing;
          console.log(
            `  ▶ FY ${fyStr}: opening from previousClosing ${previousClosing}`,
          );
        } else {
          // Fallback (should rarely happen now)
          node.openingBalance = masterOpening;
          console.log(
            `  ▶ FY ${fyStr}: opening fallback to master ${masterOpening}`,
          );
        }

        // --- YEAR OPENING ADJUSTMENT ---
        if (adjustment) {
          node.adjustment = adjustment.adjustmentAmount;
          node.effectiveOpening =
            node.openingBalance + adjustment.adjustmentAmount;
          node.adjustmentId = adjustment._id;
        } else {
          node.effectiveOpening = node.openingBalance;
        }

        // --- YEAR MOVEMENT FROM MONTHLY BALANCES ---
        let yearMovement = 0;
        if (yearData && yearData.months.length > 0) {
          yearData.months.sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year,
          );
          const firstMonth = yearData.months[0];
          const lastMonth = yearData.months[yearData.months.length - 1];

          const firstOpening = firstMonth.openingBalance ?? 0;
          const lastClosing = lastMonth.closingBalance ?? 0;

          yearMovement = lastClosing - firstOpening;

          console.log(`  ▶ FY ${fyStr}: yearMovement`, {
            firstOpening,
            lastClosing,
            yearMovement,
          });
        }

        // --- FINAL CLOSING: effectiveOpening + movement + pendingDelta ---
        node.closingBalance =
          node.effectiveOpening + yearMovement + pendingDelta;

        console.log(
          `  ▶ FY ${fyStr}: closing = effectiveOpening (${node.effectiveOpening}) + yearMovement (${yearMovement}) + pending (${pendingDelta}) = ${node.closingBalance}`,
        );

        previousClosing = node.closingBalance;
        resultChain.push(node);
      }

      // 11. Filter for only the years on this page
      const displayYears = resultChain.filter((node) =>
        pageFYs.includes(Number(node.financialYear)),
      );

      // Sort desc for UI (latest year first)
      displayYears.sort(
        (a, b) => Number(b.financialYear) - Number(a.financialYear),
      );

      console.log("✅ Final displayYears:", displayYears);

      return {
        years: displayYears,
        pagination: {
          page: safePage,
          pageSize: PAGE_SIZE,
          totalYears,
          totalPages,
        },
      };
    } catch (error) {
      console.error("❌ getYearWiseBalances error:", error);
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
        // adjustment.isCancelled = false;
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

  /**
   * Cancel an existing adjustment
   */
  cancelAdjustment: async (adjustmentId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const adjustment =
        await YearOpeningAdjustment.findById(adjustmentId).session(session);
      if (!adjustment) {
        throw new Error("Adjustment not found");
      }

      adjustment.isCancelled = true;
      await adjustment.save({ session });

      // Optionally, trigger recalculation if needed
      // await OpeningBalanceService.recalculateLedger(...);

      await session.commitTransaction();
      return adjustment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },
};

export default OpeningBalanceService;
