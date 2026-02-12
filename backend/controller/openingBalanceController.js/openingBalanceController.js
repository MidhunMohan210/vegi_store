// controllers/openingBalanceController.js

import OpeningBalanceService from "../../services/openingBalance/OpeningBalanceService.js";
import Company from "../../model/masters/CompanyModel.js";
import AccountMonthlyBalance from "../../model/AccountMonthlyBalanceModel.js";
import mongoose from "mongoose";
import AccountMaster from "../../model/masters/AccountMasterModel.js";
import AccountLedger from "../../model/AccountLedgerModel.js";
import YearOpeningAdjustment from "../../model/YearOpeningAdjustmentModel.js";
import OpeningBalanceHistory from "../../model/OpeningBalanceHistoryModel.js";
import dayjs from "dayjs";

/**
 * GET /api/opening-balance/:entityType/:entityId/years
 * Fetch year-wise opening balances
 */

export const getYearWiseBalances = async (req, res) => {
  try {
    // throw new Error("Intentional error for testing");
    const { entityType, entityId } = req.params;
    const { companyId, branchId, page } = req.query;

    if (!companyId || !branchId) {
      return res.status(400).json({
        success: false,
        message: "companyId and branchId are required",
      });
    }

    const result = await OpeningBalanceService.getYearWiseBalances(
      entityId,
      entityType,
      companyId,
      branchId,
      page,
    );

    return res.status(200).json({
      success: true,
      data: result.years,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error fetching opening balances:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

/**
 * POST /api/opening-balance/adjust
 * Save adjustment
 */
export const saveAdjustment = async (req, res) => {
  try {
    const {
      entityId,
      entityType,
      financialYear,
      adjustmentAmount,
      reason,
      companyId,
      branchId,
    } = req.body;

    // Validation
    if (
      !entityId ||
      !entityType ||
      !financialYear ||
      adjustmentAmount === undefined ||
      !reason
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const userId = req.user._id; // Assuming auth middleware sets req.user

    const adjustment = await OpeningBalanceService.saveAdjustment({
      entityId,
      entityType,
      financialYear,
      adjustmentAmount,
      reason,
      userId,
      companyId,
      branchId,
    });

    return res.status(200).json({
      success: true,
      message: "Adjustment saved and recalculated successfully",
      data: adjustment,
    });
  } catch (error) {
    console.error("Error saving adjustment:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

/**
 * DELETE /api/opening-balance/adjust/:adjustmentId
 * Cancel/Delete adjustment
 */
export const cancelAdjustment = async (req, res) => {
  try {
    const { adjustmentId } = req.params;
    // Implementation pending

    const result = await OpeningBalanceService.cancelAdjustment(adjustmentId);

    return res.status(200).json({
      success: true,
      message: "Adjustment cancelled successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error cancelling adjustment:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const getOpeningBalanceRecalculationImpact = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { companyId, branchId, fromYear, maxYears = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ message: "Invalid entityId." });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ message: "companyId is required and must be valid." });
    }

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    const fyStartMonth =
      company.financialYear?.startMonth && company.financialYear.startMonth >= 1
        ? company.financialYear.startMonth
        : 4; // default April if not set

    let Model;
    let entityField;

    if (entityType === "party") {
      Model = AccountMonthlyBalance;
      entityField = "account";
    } else {
      return res
        .status(400)
        .json({ message: "Unsupported entityType for now." });
    }

    const matchBase = {
      [entityField]: new mongoose.Types.ObjectId(entityId),
      company: new mongoose.Types.ObjectId(companyId),
    };

    if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
      matchBase.branch = new mongoose.Types.ObjectId(branchId);
    }

    // Compute financialYearStart for each row, then find the earliest FY start
    const earliestFy = await Model.aggregate([
      { $match: matchBase },
      {
        $addFields: {
          financialYearStart: {
            $cond: [
              { $gte: ["$month", fyStartMonth] },
              "$year",
              { $subtract: ["$year", 1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          minFyStart: { $min: "$financialYearStart" },
        },
      },
      { $project: { _id: 0, minFyStart: 1 } },
    ]);

    let startFy;
    if (fromYear) {
      startFy = Number(fromYear);
    } else if (earliestFy.length && earliestFy[0].minFyStart != null) {
      startFy = earliestFy[0].minFyStart;
    } else {
      return res.status(200).json({
        maxYears: Number(maxYears) || 10,
        totalTransactions: 0,
        estimatedTimeSeconds: 0,
        years: [],
      });
    }

    const parsedMaxYears = Number(maxYears) || 10;

    // Aggregate by financialYearStart
    const impactAgg = await Model.aggregate([
      { $match: matchBase },
      {
        $addFields: {
          financialYearStart: {
            $cond: [
              { $gte: ["$month", fyStartMonth] },
              "$year",
              { $subtract: ["$year", 1] },
            ],
          },
        },
      },
      {
        $match: {
          financialYearStart: { $gte: startFy },
        },
      },
      {
        $group: {
          _id: "$financialYearStart",
          transactions: { $sum: "$transactionCount" },
        },
      },
      {
        $project: {
          _id: 0,
          financialYearStart: "$_id",
          transactions: 1,
        },
      },
      { $sort: { financialYearStart: 1 } },
      { $limit: parsedMaxYears },
    ]);

    if (!impactAgg.length) {
      return res.status(200).json({
        maxYears: parsedMaxYears,
        totalTransactions: 0,
        estimatedTimeSeconds: 0,
        years: [],
      });
    }

    const totalTransactions = impactAgg.reduce(
      (sum, y) => sum + (y.transactions || 0),
      0,
    );

    const avgSecondsPerTx = 0.01;
    const estimatedTimeSeconds = Math.ceil(totalTransactions * avgSecondsPerTx);

    const years = impactAgg.map((y) => ({
      // e.g. 2021 -> "2021-22"
      financialYear: `${y.financialYearStart}-${String(
        (y.financialYearStart + 1) % 100,
      ).padStart(2, "0")}`,
      financialYearStart: y.financialYearStart,
      transactions: y.transactions,
    }));

    return res.status(200).json({
      maxYears: parsedMaxYears,
      totalTransactions,
      estimatedTimeSeconds,
      years,
    });
  } catch (error) {
    console.error("Error in getOpeningBalanceRecalculationImpact:", error);
    return res.status(500).json({
      message: "Failed to compute opening balance recalculation impact.",
      error: error.message,
    });
  }
};

/**
 * Helper: calculate signed delta in "dr" sense.
 * Returns +ve if receivable increased, -ve if decreased.
 */
function calculateDeltaAmount(oldAmount, oldType, newAmount, newType) {
  const toSigned = (amount, type) => (type === "dr" ? amount : -amount);
  return toSigned(newAmount, newType) - toSigned(oldAmount, oldType);
}

/**
 * Helper: derive financialYearStart for a given calendar (year, month)
 * using company.financialYear.startMonth.
 */
function getFinancialYearStart(year, month, fyStartMonth) {
  return month >= fyStartMonth ? year : year - 1;
}

/**
 * Helper: build "2025-26" style label from financialYearStart.
 */
function formatFinancialYearLabel(fyStart) {
  const next = fyStart + 1;
  return `${fyStart}-${String(next % 100).padStart(2, "0")}`;
}

/**
 * Recalculate runningBalance in AccountLedger and AccountMonthlyBalance
 * for a given account+branch over a financial-year range.
 *
 * Assumptions:
 * - company.financialYear.startMonth = fyStartMonth (1–12)
 * - Master opening for the FIRST FY has already been updated on AccountMaster.
 */
async function recalculateLedgerChainForAccount({
  companyId,
  accountId,
  branchId,
  fyStartFrom,
  fyStartTo,
  fyStartMonth,
}) {
  console.log("[OB-RECALC] Start recalc for account", {
    companyId: String(companyId),
    accountId: String(accountId),
    branchId: String(branchId),
    fyStartFrom,
    fyStartTo,
    fyStartMonth,
  });

  // 1) Determine date range for the FY window
  const startDate = dayjs()
    .year(fyStartFrom)
    .month(fyStartMonth - 1)
    .date(1)
    .startOf("day")
    .toDate();

  const endFyEndYear = fyStartTo + 1;
  const endFyEndMonth = fyStartMonth - 1 || 12;
  const endDate = dayjs()
    .year(endFyEndYear)
    .month(endFyEndMonth - 1)
    .endOf("month")
    .endOf("day")
    .toDate();

  console.log("[OB-RECALC] Date window:", { startDate, endDate });

  // 2) Fetch all ledger entries for this account+branch in date range
  const ledgers = await AccountLedger.find({
    company: companyId,
    branch: branchId,
    account: accountId,
    transactionDate: { $gte: startDate, $lte: endDate },
  })
    .sort({ transactionDate: 1, _id: 1 })
    .lean();

  console.log("[OB-RECALC] Ledger rows found:", ledgers.length);

  if (!ledgers.length) {
    return { updatedTransactions: 0 };
  }

  // 3) Determine starting running balance
  // Simplified: start from 0 in this window.
  // (Later you can compute last runningBalance before startDate.)
  let runningBalance = 0;
  const bulkOps = [];

  for (const row of ledgers) {
    const signedAmount = row.ledgerSide === "debit" ? row.amount : -row.amount;

    runningBalance += signedAmount;

    bulkOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { runningBalance } },
      },
    });
  }

  if (bulkOps.length) {
    console.log(
      "[OB-RECALC] Bulk updating runningBalance for:",
      bulkOps.length,
    );
    await AccountLedger.bulkWrite(bulkOps);
  }

  // 4) Rebuild AccountMonthlyBalance for this account+branch in range
  console.log("[OB-RECALC] Rebuilding AccountMonthlyBalance…");

  await AccountMonthlyBalance.deleteMany({
    company: companyId,
    branch: branchId,
    account: accountId,
    year: { $gte: fyStartFrom - 1, $lte: fyStartTo + 1 },
  });

  const monthAgg = {};
  for (const row of ledgers) {
    const d = dayjs(row.transactionDate);
    const y = d.year();
    const m = d.month() + 1;
    const key = `${y}-${m}`;

    if (!monthAgg[key]) {
      monthAgg[key] = {
        year: y,
        month: m,
        totalDebit: 0,
        totalCredit: 0,
        transactionCount: 0,
      };
    }

    if (row.ledgerSide === "debit") {
      monthAgg[key].totalDebit += row.amount;
    } else {
      monthAgg[key].totalCredit += row.amount;
    }
    monthAgg[key].transactionCount += 1;
  }

  const monthlyDocs = Object.values(monthAgg).map((m) => ({
    company: companyId,
    branch: branchId,
    account: accountId,
    accountName: "", // optional: fill from AccountMaster if needed
    year: m.year,
    month: m.month,
    periodKey: `${m.year}-${String(m.month).padStart(2, "0")}`,
    openingBalance: 0, // you can refine this later
    totalDebit: m.totalDebit,
    totalCredit: m.totalCredit,
    closingBalance: 0, // can compute from last runningBalance of the month
    transactionCount: m.transactionCount,
  }));

  console.log("[OB-RECALC] Monthly docs to insert:", monthlyDocs.length);

  if (monthlyDocs.length) {
    await AccountMonthlyBalance.insertMany(monthlyDocs);
  }

  console.log("[OB-RECALC] Done recalc for account", {
    accountId: String(accountId),
    branchId: String(branchId),
    updatedTransactions: ledgers.length,
  });

  return { updatedTransactions: ledgers.length };
}

/**
 * POST /api/opening-balance/update?companyId=
 * Body: { entityType, entityId, newOpeningBalance, openingBalanceType, reason }
 */
export const updateAccountOpeningBalance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { companyId } = req.query;
    const {
      entityType,
      entityId,
      newOpeningBalance,
      openingBalanceType,
      reason,
    } = req.body;

    const userId = req.user?._id || req.userId;

    console.log("[OB-UPDATE] Request payload:", {
      companyId,
      entityType,
      entityId,
      newOpeningBalance,
      openingBalanceType,
      reason,
      userId: userId ? String(userId) : null,
    });

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ message: "Valid companyId is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ message: "Valid entityId is required." });
    }
    if (entityType !== "party") {
      return res
        .status(400)
        .json({ message: "Only entityType 'party' supported here." });
    }
    if (typeof newOpeningBalance !== "number") {
      return res
        .status(400)
        .json({ message: "newOpeningBalance must be a number." });
    }
    if (!["dr", "cr"].includes(openingBalanceType)) {
      return res
        .status(400)
        .json({ message: "openingBalanceType must be 'dr' or 'cr'." });
    }

    const company = await Company.findById(companyId).session(session);
    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    const fyStartMonth =
      company.financialYear?.startMonth && company.financialYear.startMonth >= 1
        ? company.financialYear.startMonth
        : 4;
    const firstFinancialYearStart = company.financialYear?.startingYear;
    if (!firstFinancialYearStart) {
      return res.status(400).json({
        message: "Company.financialYear.startingYear is not configured.",
      });
    }

    console.log("[OB-UPDATE] Company FY:", {
      fyStartMonth,
      firstFinancialYearStart,
    });

    const account = await AccountMaster.findById(entityId).session(session);
    if (!account) {
      return res.status(404).json({ message: "Account not found." });
    }

    const oldOpeningBalance = account.openingBalance || 0;
    const oldOpeningType = account.openingBalanceType || "dr";

    const deltaAmount = calculateDeltaAmount(
      oldOpeningBalance,
      oldOpeningType,
      newOpeningBalance,
      openingBalanceType,
    );

    console.log("[OB-UPDATE] Old vs new opening:", {
      oldOpeningBalance,
      oldOpeningType,
      newOpeningBalance,
      newOpeningType: openingBalanceType,
      deltaAmount,
    });

    if (deltaAmount === 0) {
      console.log(
        "[OB-UPDATE] No change in opening balance; skipping recalculation.",
      );
      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        message: "Opening balance unchanged; no recalculation required.",
        totalTransactions: 0,
        affectedFinancialYears: [],
        estimatedTimeSeconds: 0,
      });
    }

    // Determine FY window using "break at first adjustment" rule
    const firstFY = firstFinancialYearStart;

    const now = dayjs();
    const nowFyStart = getFinancialYearStart(
      now.year(),
      now.month() + 1,
      fyStartMonth,
    );

    console.log("[OB-UPDATE] Current FY start:", { nowFyStart });

    const allAdjustments = await YearOpeningAdjustment.findByEntity(
      entityId.toString(),
      "party",
    );

    // Find first adjustment FY strictly after firstFY
    const adjustmentFyStarts = allAdjustments
      .map((a) => Number(a.financialYear))
      .filter((fy) => fy > firstFY)
      .sort((a, b) => a - b);

    const firstBreakFy = adjustmentFyStarts[0] || null;

    // If there is an adjustment in a later FY, stop just before that FY.
    // Otherwise, go up to current FY start.
    const fyStartFrom = firstFY;
    const fyStartTo = firstBreakFy ? firstBreakFy - 1 : nowFyStart;

    console.log("[OB-UPDATE] Final FY window (no adminYears):", {
      fyStartFrom,
      fyStartTo,
      firstBreakFy,
      adjustmentFyStarts,
    });

    const affectedFinancialYears = [];
    for (let fy = fyStartFrom; fy <= fyStartTo; fy++) {
      affectedFinancialYears.push({
        financialYearStart: fy,
        financialYear: formatFinancialYearLabel(fy),
        transactions: 0,
      });
    }

    // Compute impact from AccountMonthlyBalance for ALL branches
    console.log("[OB-UPDATE] Aggregating impact from AccountMonthlyBalance…");

    const impactAgg = await AccountMonthlyBalance.aggregate([
      {
        $match: {
          company: new mongoose.Types.ObjectId(companyId),
          account: new mongoose.Types.ObjectId(entityId),
        },
      },
      {
        $addFields: {
          financialYearStart: {
            $cond: [
              { $gte: ["$month", fyStartMonth] },
              "$year",
              { $subtract: ["$year", 1] },
            ],
          },
        },
      },
      {
        $match: {
          financialYearStart: { $gte: fyStartFrom, $lte: fyStartTo },
        },
      },
      {
        $group: {
          _id: "$financialYearStart",
          transactions: { $sum: "$transactionCount" },
        },
      },
      {
        $project: {
          _id: 0,
          financialYearStart: "$_id",
          transactions: 1,
        },
      },
    ]).session(session);

    console.log("[OB-UPDATE] impactAgg:", impactAgg);

    const impactByYear = new Map();
    let totalTransactions = 0;
    for (const row of impactAgg) {
      impactByYear.set(row.financialYearStart, row.transactions);
      totalTransactions += row.transactions || 0;
    }

    affectedFinancialYears.forEach((y) => {
      y.transactions = impactByYear.get(y.financialYearStart) || 0;
    });

    const avgSecondsPerTx = 0.01;
    const estimatedTimeSeconds = Math.ceil(totalTransactions * avgSecondsPerTx);

    console.log("[OB-UPDATE] Impact summary:", {
      totalTransactions,
      estimatedTimeSeconds,
      affectedFinancialYears,
    });

    const historyArr = await OpeningBalanceHistory.create(
      [
        {
          company: company._id,
          branchScope: "all",
          entityType: "party",
          entityId: account._id,
          financialYearStart: firstFY,
          previousOpeningBalance: oldOpeningBalance,
          previousOpeningType: oldOpeningType,
          newOpeningBalance,
          newOpeningType: openingBalanceType,
          deltaAmount,
          affectedFinancialYears,
          totalTransactions,
          estimatedTimeSeconds,
          triggeredBy: userId || null,
          reason: reason || null,
          status: "in_progress",
        },
      ],
      { session },
    );
    const historyDoc = historyArr[0];

    // Update master opening on AccountMaster
    account.openingBalance = newOpeningBalance;
    account.openingBalanceType = openingBalanceType;
    await account.save({ session });

    // Recalculate ledger chain for ALL branches for this account
    console.log("[OB-UPDATE] Finding branches for recalc…");

    const branches = await AccountMonthlyBalance.distinct("branch", {
      company: company._id,
      account: account._id,
    }).session(session);

    console.log("[OB-UPDATE] Branches to recalc:", branches.map(String));

    let totalUpdatedTransactions = 0;

    for (const branchId of branches) {
      const { updatedTransactions } = await recalculateLedgerChainForAccount({
        companyId: company._id,
        accountId: account._id,
        branchId,
        fyStartFrom,
        fyStartTo,
        fyStartMonth,
      });
      totalUpdatedTransactions += updatedTransactions;
    }

    console.log(
      "[OB-UPDATE] Total updated ledger rows:",
      totalUpdatedTransactions,
    );

    historyDoc.status = "completed";
    await historyDoc.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Opening balance updated and ledger recalculated.",
      historyId: historyDoc._id,
      totalTransactions,
      estimatedTimeSeconds,
      affectedFinancialYears,
    });
  } catch (error) {
    console.error("Error in updateAccountOpeningBalance:", error);
    try {
      await session.abortTransaction();
      session.endSession();
    } catch (_) {}

    return res.status(500).json({
      message: "Failed to update opening balance.",
      error: error.message,
    });
  }
};
