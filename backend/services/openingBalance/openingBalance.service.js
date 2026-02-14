import mongoose from "mongoose";
import AccountMaster from "../../model/masters/AccountMasterModel.js";
import AccountMonthlyBalance from "../../model/AccountMonthlyBalanceModel.js";
import AccountLedger from "../../model/AccountLedgerModel.js";
import YearOpeningAdjustment from "../../model/YearOpeningAdjustmentModel.js";
import Company from "../../model/masters/CompanyModel.js";
import CompanySettings from "../../model/CompanySettings.model.js";
import Branch from "../../model/masters/BranchModel.js";
import {
  calculateFinancialYear,
  generateFYList,
  getFYDateRange,
  getMonthsInFY,
  getMonthDateRange,
} from "../../utils/financialYear.js";
import OutstandingModel from "../../model/OutstandingModel.js";
import { calculateReceiptPaymentTotals } from "../../helpers/transactionHelpers/outstandingService.js";

// Convert amount + type → signed number
export function normalizeAmount(amount = 0, type = "dr") {
  return type === "cr" ? -Math.abs(amount) : Math.abs(amount);
}

// Convert signed number → { amount, type }
export function denormalizeAmount(value = 0) {
  return {
    amount: Math.abs(value),
    type: value < 0 ? "cr" : "dr",
  };
}
/**
 * ============================================
 * OPENING BALANCE SERVICE - IMPACT ANALYSIS
 * ============================================
 *
 * Purpose: Analyze the impact of changing opening balance
 * - Check for dirty data (needsRecalculation flag)
 * - Determine which branches/years will be affected
 * - Count transactions that need recalculation
 * - Generate warning message for user
 *
 * This is a READ-ONLY operation for impact analysis
 * ============================================
 */

/**
 * Check if any monthly balances are marked as needing recalculation
 * This prevents operating on dirty/inconsistent data
 *
 * @param {String} accountId - Account ObjectId
 * @param {Array<String>} branchIds - Array of branch ObjectIds
 *
 * @returns {Object} - { isDirty: Boolean, dirtyBranches: Array }
 */
const checkDirtyMonthlyBalances = async (accountId, branchIds) => {
  console.log(
    `[Opening Balance Service] Checking for dirty monthly balances...`,
  );
  console.log(
    `[Opening Balance Service] Account: ${accountId}, Branches: ${branchIds.length}`,
  );

  try {
    // Find any monthly balance marked for recalculation
    const dirtyBalances = await AccountMonthlyBalance.find({
      account: accountId,
      branch: { $in: branchIds },
      needsRecalculation: true,
    })
      .populate("branch", "branchName")
      .select("branch year month periodKey")
      .lean();

    if (dirtyBalances.length > 0) {
      console.log(
        `[Opening Balance Service] ⚠️ Found ${dirtyBalances.length} dirty monthly balances`,
      );

      // Group by branch for better error reporting
      const dirtyByBranch = {};
      dirtyBalances.forEach((balance) => {
        const branchId = balance.branch._id.toString();
        const branchName = balance.branch.branchName;

        if (!dirtyByBranch[branchId]) {
          dirtyByBranch[branchId] = {
            branchId,
            branchName,
            dirtyMonths: [],
          };
        }

        dirtyByBranch[branchId].dirtyMonths.push(balance.periodKey);
      });

      return {
        isDirty: true,
        dirtyBranches: Object.values(dirtyByBranch),
      };
    }

    console.log(`[Opening Balance Service] ✅ No dirty monthly balances found`);
    return { isDirty: false, dirtyBranches: [] };
  } catch (error) {
    console.error(
      `[Opening Balance Service] Error checking dirty balances:`,
      error,
    );
    throw error;
  }
};

/**
 * Get impact analysis for a specific branch
 * Determines which years need recalculation and counts transactions
 *
 * @param {String} accountId - Account ObjectId
 * @param {String} branchId - Branch ObjectId
 * @param {String} branchName - Branch name for display
 * @param {Object} companyFYConfig - Company FY configuration
 *
 * @returns {Object|null} - Branch impact data or null if no transactions
 */
const getBranchImpact = async (
  accountId,
  branchId,
  branchName,
  companyFYConfig,
) => {
  console.log(
    `[Opening Balance Service] Analyzing branch: ${branchName} (${branchId})`,
  );

  try {
    // ========================================
    // STEP 1: Find first transaction (via monthly balance)
    // ========================================
    console.log(
      `[Opening Balance Service] Step 1: Finding first transaction for branch ${branchName}...`,
    );

    // const firstMonthlyBalance = await AccountMonthlyBalance.findOne({
    //   account: accountId,
    //   branch: branchId,
    // })
    //   .sort({ year: 1, month: 1 })
    //   .select("year month")
    //   .lean();

    // // Skip if no transactions exist
    // if (!firstMonthlyBalance) {
    //   console.log(
    //     `[Opening Balance Service] ℹ️ No transactions found for branch ${branchName}, skipping`,
    //   );
    //   return null;
    // }

    // // ✅ NEW: Calculate which FY this month belongs to
    // // Create a date from the first monthly balance
    // const firstDate = new Date(
    //   firstMonthlyBalance.year,
    //   firstMonthlyBalance.month - 1,
    //   1,
    // );
    // const startFY = calculateFinancialYear(firstDate, companyFYConfig);
    const startFY = companyFYConfig?.startingYear
      ? `${companyFYConfig.startingYear}-${companyFYConfig.startingYear + 1}`
      : "";

    // console.log(
    //   `[Opening Balance Service] First monthly balance: ${firstMonthlyBalance.month}/${firstMonthlyBalance.year}`,
    // );
    console.log(`[Opening Balance Service] Start FY: ${startFY}`);

    // ========================================
    // STEP 2: Find last transaction (via ledger)
    // ========================================
    console.log(
      `[Opening Balance Service] Step 2: Finding last transaction for branch ${branchName}...`,
    );

    const lastTransaction = await AccountLedger.findOne({
      account: accountId,
      branch: branchId,
    })
      .sort({ transactionDate: -1 })
      .select("transactionDate")
      .lean();

    // Safety check (shouldn't happen if monthly balance exists)
    if (!lastTransaction) {
      console.log(
        `[Opening Balance Service] ⚠️ No ledger entries found for branch ${branchName}, skipping`,
      );
      return null;
    }

    const lastTransactionDate = lastTransaction.transactionDate;
    console.log(
      `[Opening Balance Service] Last transaction date: ${lastTransactionDate}`,
    );

    // Calculate which FY the last transaction falls into
    const endFY = calculateFinancialYear(lastTransactionDate, companyFYConfig);
    console.log(`[Opening Balance Service] Last transaction FY: ${endFY}`);

    // ========================================
    // STEP 3: Generate list of FYs to recalculate
    // ========================================
    console.log(
      `[Opening Balance Service] Step 3: Generating FY list from ${startFY} to ${endFY}...`,
    );

    const allFYs = generateFYList(startFY, endFY, companyFYConfig); // ✅ Pass FY string, not calendar year
    console.log(
      `[Opening Balance Service] Generated ${allFYs.length} FYs:`,
      allFYs,
    );

    // ========================================
    // STEP 4: Check for year opening adjustments
    // ========================================
    console.log(
      `[Opening Balance Service] Step 4: Checking for year opening adjustments...`,
    );

    const finalYearsToRecalculate = allFYs;
    // let stoppedDueToAdjustment = null;

    // console.log("all Fys", allFYs);

    // for (const fy of allFYs) {
    //   // Extract starting year from FY string "2024-2025" → "2024"
    //   const fyStartYear = fy.split("-")[0];

    //   console.log({
    //     entityId: accountId,
    //     entityType: "party",
    //     branch: branchId,
    //     financialYear: fyStartYear, // ✅ Now matches database format
    //     isCancelled: false,
    //   });

    //   // Check if this FY has an adjustment BEFORE adding it
    //   const adjustment = await YearOpeningAdjustment.findOne({
    //     entityId: accountId,
    //     entityType: "party",
    //     branch: branchId,
    //     financialYear: fyStartYear, // ✅ Use "2024" not "2024-2025"
    //     isCancelled: false,
    //   }).lean();

    //   console.log("adjustment", adjustment);

    //   if (adjustment) {
    //     console.log(
    //       `[Opening Balance Service] ⚠️ Found adjustment for FY ${fy}, stopping before this year`,
    //     );
    //     stoppedDueToAdjustment = fy;
    //     // DON'T add this year - stop before it
    //     break;
    //   }

    //   // If no adjustment, add this year to recalculation list
    //   finalYearsToRecalculate.push(fy);
    // }

    console.log(
      `[Opening Balance Service] Final FYs to recalculate:`,
      finalYearsToRecalculate,
    );
    // console.log(
    //   `[Opening Balance Service] Stopped due to adjustment at: ${stoppedDueToAdjustment}`,
    // );

    // Skip if no years to recalculate
    if (finalYearsToRecalculate.length === 0) {
      console.log(
        `[Opening Balance Service] ℹ️ All years have adjustments for branch ${branchName}, skipping`,
      );
      return null;
    }

    // ========================================
    // STEP 5: Count transactions for affected years
    // ========================================
    console.log(
      `[Opening Balance Service] Step 5: Counting transactions for ${finalYearsToRecalculate.length} FYs...`,
    );

    let totalTransactionCount = 0;

    for (const fy of finalYearsToRecalculate) {
      const fyDateRange = getFYDateRange(fy, companyFYConfig);

      const count = await AccountLedger.countDocuments({
        account: accountId,
        branch: branchId,
        transactionDate: {
          $gte: fyDateRange.start,
          $lte: fyDateRange.end,
        },
      });

      console.log(`[Opening Balance Service] FY ${fy}: ${count} transactions`);
      totalTransactionCount += count;
    }

    console.log(
      `[Opening Balance Service] Total transactions for branch ${branchName}: ${totalTransactionCount}`,
    );

    // ========================================
    // STEP 6: Return branch impact data
    // ========================================
    return {
      branchId,
      branchName,
      yearsToRecalculate: finalYearsToRecalculate,
      transactionCount: totalTransactionCount,
      // stoppedDueToAdjustment,
    };
  } catch (error) {
    console.error(
      `[Opening Balance Service] Error analyzing branch ${branchName}:`,
      error,
    );
    throw error;
  }
};

/**
 * Analyze impact of changing opening balance
 * This is the main function called by the controller
 * Returns warning data for user confirmation
 *
 * @param {String} companyId - Company ObjectId
 * @param {String} accountId - Account ObjectId
 * @param {Number} newOpeningBalance - New opening balance value
 * @param {String} openingBalanceType - "dr" or "cr"
 *
 * @returns {Object} - Impact analysis result
 */
export const analyzeOpeningBalanceImpact = async (
  companyId,
  accountId,
  newOpeningBalance,
  openingBalanceType,
) => {
  console.log(`\n========================================`);
  console.log(`[Opening Balance Service] ANALYZING IMPACT`);
  console.log(`========================================`);
  console.log(`Company: ${companyId}`);
  console.log(`Account: ${accountId}`);
  console.log(
    `New Opening Balance: ${newOpeningBalance} (${openingBalanceType})`,
  );
  console.log(`========================================\n`);

  try {
    // ========================================
    // PHASE 1: FETCH ACCOUNT & BRANCHES
    // ========================================
    console.log(
      `[Opening Balance Service] Phase 1: Fetching account and branches...`,
    );

    const account = await AccountMaster.findOne({
      _id: accountId,
      company: companyId,
    })
      .populate("branches", "branchName")
      .lean();

    if (!account) {
      console.log(`[Opening Balance Service] ❌ Account not found`);
      return {
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: "Account not found",
      };
    }

    console.log(`[Opening Balance Service] Account: ${account.accountName}`);
    console.log(
      `[Opening Balance Service] Current opening balance: ${account.openingBalance} (${account.openingBalanceType})`,
    );
    console.log(
      `[Opening Balance Service] Branches: ${account.branches.length}`,
    );

    const branchIds = account.branches.map((b) => b._id.toString());

    // ========================================
    // PHASE 2: DIRTY DATA CHECK
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 2: Checking for dirty data...`,
    );

    const dirtyCheck = await checkDirtyMonthlyBalances(accountId, branchIds);

    if (dirtyCheck.isDirty) {
      console.log(
        `[Opening Balance Service] ❌ Dirty data found, blocking operation`,
      );
      return {
        success: false,
        error: "DIRTY_DATA",
        message:
          "Some monthly balances are marked for recalculation. Please perform manual recalculation or wait for automatic night recalculation before editing opening balance.",
        dirtyBranches: dirtyCheck.dirtyBranches,
      };
    }

    // ========================================
    // PHASE 3: FETCH COMPANY FY CONFIGURATION
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 3: Fetching company FY configuration...`,
    );

    const company = await Company.findById(companyId)
      .select("financialYear")
      .lean();

    if (!company) {
      console.log(`[Opening Balance Service] ❌ Company not found`);
      return {
        success: false,
        error: "COMPANY_NOT_FOUND",
        message: "Company not found",
      };
    }

    const companySettings = await CompanySettings.findOne({
      company: companyId,
    })
      .select("financialYear")
      .lean();

    if (!companySettings) {
      console.log(`[Opening Balance Service] ❌ Company settings not found`);
      return {
        success: false,
        error: "COMPANY_SETTINGS_NOT_FOUND",
        message: "Company settings not found",
      };
    }

    const companyFYConfig = {
      format: company.financialYear.format,
      startingYear: company.financialYear.startingYear,
      startMonth: company.financialYear.startMonth,
      endMonth: company.financialYear.endMonth,
      currentFY: companySettings.financialYear.currentFY,
    };

    console.log(`[Opening Balance Service] FY Config:`, companyFYConfig);

    // ========================================
    // PHASE 4: ANALYZE IMPACT FOR EACH BRANCH
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 4: Analyzing impact for each branch...`,
    );

    const branchImpactPromises = account.branches.map((branch) =>
      getBranchImpact(
        accountId,
        branch._id.toString(),
        branch.branchName,
        companyFYConfig,
      ),
    );
    const branchImpacts = await Promise.all(branchImpactPromises);

    // Filter out null results (branches with no transactions)
    const validBranchImpacts = branchImpacts.filter(
      (impact) => impact !== null,
    );

    console.log(
      `[Opening Balance Service] Valid branch impacts: ${validBranchImpacts.length}`,
    );

    // Check if any branches need recalculation
    if (validBranchImpacts.length === 0) {
      console.log(`[Opening Balance Service] ℹ️ No recalculation needed`);
      return {
        success: false,
        error: "NO_RECALCULATION_NEEDED",
        message:
          "No transactions found for this account across any branch, or all years have adjustments.",
      };
    }

    // ========================================
    // PHASE 5: CALCULATE TOTALS & ESTIMATE TIME
    // ========================================
    console.log(`\n[Opening Balance Service] Phase 5: Calculating totals...`);

    const totalTransactions = validBranchImpacts.reduce(
      (sum, impact) => sum + impact.transactionCount,
      0,
    );

    // Estimate time: ~150 transactions per second
    const estimatedSeconds = Math.ceil(totalTransactions / 150);
    const estimatedTime = `${estimatedSeconds}s`;

    console.log(
      `[Opening Balance Service] Total transactions: ${totalTransactions}`,
    );
    console.log(`[Opening Balance Service] Estimated time: ${estimatedTime}`);

    // ========================================
    // PHASE 6: RETURN IMPACT ANALYSIS
    // ========================================
    console.log(`\n[Opening Balance Service] ✅ Impact analysis complete`);
    console.log(`========================================\n`);

    return {
      success: true,
      data: {
        accountId,
        accountName: account.accountName,
        oldOpeningBalance: account.openingBalance,
        oldOpeningBalanceType: account.openingBalanceType,
        newOpeningBalance,
        newOpeningBalanceType: openingBalanceType,
        affectedBranches: validBranchImpacts,
        totalTransactions,
        estimatedTime,
      },
    };
  } catch (error) {
    console.error(`[Opening Balance Service] Error analyzing impact:`, error);
    throw error;
  }
};

/**
 * ============================================
 * OPENING BALANCE SERVICE - RECALCULATION
 * ============================================
 *
 * Purpose: Execute the actual recalculation
 * - Update master opening balance
 * - Recalculate ledger entries month-by-month
 * - Update monthly balances
 * - All within MongoDB transaction (all-or-nothing)
 *
 * This is a WRITE operation with transaction safety
 * ============================================
 */

/**
 * Recalculate ledger entries and monthly balances for a specific branch
 * Processes month-by-month for each financial year
 *
 * @param {String} accountId - Account ObjectId
 * @param {String} branchId - Branch ObjectId
 * @param {Array<String>} yearsToRecalculate - Array of FY strings ["2024-2025", "2025-2026"]
 * @param {Number} newOpeningBalance - New opening balance value
 * @param {String} openingBalanceType - "dr" or "cr"
 * @param {Object} companyFYConfig - Company FY configuration
 * @param {Object} session - MongoDB transaction session
 *
 * @returns {Object} - { yearsRecalculated, transactionsUpdated, monthlyBalancesUpdated }
 */
const recalculateBranchLedger = async (
  accountId,
  branchId,
  yearsToRecalculate,
  newOpeningBalance,
  openingBalanceType,
  companyFYConfig,
  session,
) => {
  console.log(`\n[Recalculation] Starting branch recalculation...`);
  console.log(`[Recalculation] Branch: ${branchId}`);
  console.log(`[Recalculation] Years: ${yearsToRecalculate.length}`);

  let totalTransactionsUpdated = 0;
  let totalMonthlyBalancesUpdated = 0;

  // Starting balance for first FY
  let currentOpeningBalance = newOpeningBalance;

  try {
    // ========================================
    // PROCESS EACH FINANCIAL YEAR
    // ========================================
    for (const fy of yearsToRecalculate) {
      console.log(
        `\n[Recalculation] ========== Processing FY: ${fy} ==========`,
      );
      console.log(
        `[Recalculation] Opening balance for FY ${fy}: ${currentOpeningBalance}`,
      );

      // Get all months in this FY
      const months = getMonthsInFY(fy, companyFYConfig);
      console.log(
        `[Recalculation] Processing ${months.length} months in FY ${fy}`,
      );

      let monthOpeningBalance = currentOpeningBalance;

      // ========================================
      // PROCESS EACH MONTH IN FY
      // ========================================
      for (const monthInfo of months) {
        const { year, month, label } = monthInfo;
        console.log(`\n[Recalculation] --- Processing Month: ${label} ---`);
        console.log(
          `[Recalculation] Month opening balance: ${monthOpeningBalance}`,
        );

        // Get date range for this month
        const { start: monthStart, end: monthEnd } = getMonthDateRange(
          year,
          month,
        );

        // ========================================
        // STEP 1: FETCH LEDGER ENTRIES FOR THIS MONTH
        // ========================================
        console.log(`[Recalculation] Step 1: Fetching ledger entries...`);

        const ledgerEntries = await AccountLedger.find({
          account: accountId,
          branch: branchId,
          transactionDate: {
            $gte: monthStart,
            $lte: monthEnd,
          },
        })
          .sort({ transactionDate: 1, createdAt: 1 }) // Chronological order
          .session(session)
          .lean();

        console.log(
          `[Recalculation] Found ${ledgerEntries.length} ledger entries for ${label}`,
        );

        // ========================================
        // STEP 2: RECALCULATE RUNNING BALANCES
        // ========================================
        console.log(
          `[Recalculation] Step 2: Recalculating running balances...`,
        );

        let currentBalance = monthOpeningBalance;
        let totalDebit = 0;
        let totalCredit = 0;
        const bulkOps = [];

        for (const entry of ledgerEntries) {
          // Update running balance based on ledger side
          if (entry.ledgerSide === "debit") {
            if (openingBalanceType === "dr") {
              currentBalance += entry.amount;
            } else {
              // Credit balance account
              currentBalance -= entry.amount;
            }
            totalDebit += entry.amount;
          } else if (entry.ledgerSide === "credit") {
            if (openingBalanceType === "dr") {
              currentBalance -= entry.amount;
            } else {
              // Credit balance account
              currentBalance += entry.amount;
            }
            totalCredit += entry.amount;
          }

          // Prepare bulk update operation
          bulkOps.push({
            updateOne: {
              filter: { _id: entry._id },
              update: { $set: { runningBalance: currentBalance } },
            },
          });
        }

        const monthClosingBalance = currentBalance;

        console.log(`[Recalculation] Month ${label} summary:`);
        console.log(`[Recalculation] - Opening: ${monthOpeningBalance}`);
        console.log(`[Recalculation] - Total Debit: ${totalDebit}`);
        console.log(`[Recalculation] - Total Credit: ${totalCredit}`);
        console.log(`[Recalculation] - Closing: ${monthClosingBalance}`);

        // ========================================
        // STEP 3: BULK UPDATE LEDGER ENTRIES
        // ========================================
        if (bulkOps.length > 0) {
          console.log(
            `[Recalculation] Step 3: Bulk updating ${bulkOps.length} ledger entries...`,
          );

          const bulkResult = await AccountLedger.bulkWrite(bulkOps, {
            session,
          });
          totalTransactionsUpdated += bulkResult.modifiedCount;

          console.log(
            `[Recalculation] Updated ${bulkResult.modifiedCount} ledger entries`,
          );
        } else {
          console.log(
            `[Recalculation] No ledger entries to update for ${label}`,
          );
        }

        // ========================================
        // STEP 4: UPDATE MONTHLY BALANCE
        // ========================================
        console.log(`[Recalculation] Step 4: Updating monthly balance...`);

        const periodKey = `${year}-${String(month).padStart(2, "0")}`;

        const monthlyBalanceUpdate = await AccountMonthlyBalance.updateOne(
          {
            account: accountId,
            branch: branchId,
            year: year,
            month: month,
          },
          {
            $set: {
              openingBalance: monthOpeningBalance,
              totalDebit,
              totalCredit,
              closingBalance: monthClosingBalance,
              transactionCount: ledgerEntries.length,
              needsRecalculation: false, // Clear dirty flag
              lastUpdated: new Date(),
            },
          },
          { session },
        );

        if (monthlyBalanceUpdate.modifiedCount > 0) {
          totalMonthlyBalancesUpdated++;
          console.log(
            `[Recalculation] ✅ Monthly balance updated for ${label}`,
          );
        } else {
          console.log(
            `[Recalculation] ℹ️ No monthly balance record found for ${label} (might not exist)`,
          );
        }

        // ========================================
        // STEP 5: SET NEXT MONTH'S OPENING
        // ========================================
        monthOpeningBalance = monthClosingBalance;
      }

      // Store FY closing balance for next FY's opening
      currentOpeningBalance = monthOpeningBalance;
      console.log(
        `[Recalculation] FY ${fy} closing balance: ${currentOpeningBalance}`,
      );
    }

    console.log(
      `\n[Recalculation] ========== Branch Recalculation Complete ==========`,
    );
    console.log(
      `[Recalculation] Total transactions updated: ${totalTransactionsUpdated}`,
    );
    console.log(
      `[Recalculation] Total monthly balances updated: ${totalMonthlyBalancesUpdated}`,
    );

    return {
      yearsRecalculated: yearsToRecalculate,
      transactionsUpdated: totalTransactionsUpdated,
      monthlyBalancesUpdated: totalMonthlyBalancesUpdated,
    };
  } catch (error) {
    console.error(`[Recalculation] Error recalculating branch ledger:`, error);
    throw error;
  }
};

/**
 * Execute opening balance update with recalculation
 * This is the main function called by the controller after user confirmation
 * Uses MongoDB transaction for all-or-nothing execution
 *
 * @param {String} companyId - Company ObjectId
 * @param {String} accountId - Account ObjectId
 * @param {Number} newOpeningBalance - New opening balance value
 * @param {String} openingBalanceType - "dr" or "cr"
 * @param {Object} impactData - Impact analysis data from analyzeOpeningBalanceImpact
 *
 * @returns {Object} - Execution result with detailed breakdown
 */
export const executeOpeningBalanceUpdate = async (
  companyId,
  accountId,
  newOpeningBalance,
  openingBalanceType,
  impactData,
) => {
  console.log(`\n========================================`);
  console.log(`[Opening Balance Service] EXECUTING RECALCULATION`);
  console.log(`========================================`);
  console.log(`Company: ${companyId}`);
  console.log(`Account: ${accountId}`);
  console.log(
    `New Opening Balance: ${newOpeningBalance} (${openingBalanceType})`,
  );
  console.log(`Affected Branches: ${impactData.affectedBranches.length}`);
  console.log(`========================================\n`);

  const startTime = Date.now();
  let session = null;

  try {
    // ========================================
    // PHASE 1: START MONGODB TRANSACTION
    // ========================================
    console.log(
      `[Opening Balance Service] Phase 1: Starting MongoDB transaction...`,
    );

    session = await mongoose.startSession();
    session.startTransaction();

    console.log(`[Opening Balance Service] ✅ Transaction started`);

    // ========================================
    // PHASE 2: UPDATE MASTER OPENING BALANCE
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 2: Updating master opening balance...`,
    );

    const masterUpdateResult = await AccountMaster.updateOne(
      { _id: accountId, company: companyId },
      {
        $set: {
          openingBalance: newOpeningBalance,
          openingBalanceType: openingBalanceType,
        },
      },
      { session },
    );

    if (masterUpdateResult.modifiedCount === 0) {
      throw new Error("Failed to update master opening balance");
    }

    console.log(`[Opening Balance Service] ✅ Master opening balance updated`);

    // ========================================
    // PHASE 3: FETCH COMPANY FY CONFIGURATION
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 3: Fetching company FY configuration...`,
    );

    const company = await Company.findById(companyId)
      .select("financialYear")
      .lean();

    const companyFYConfig = {
      format: company.financialYear.format,
      startMonth: company.financialYear.startMonth,
      endMonth: company.financialYear.endMonth,
    };

    console.log(`[Opening Balance Service] FY Config:`, companyFYConfig);

    // ========================================
    // PHASE 4: RECALCULATE ALL BRANCHES IN PARALLEL
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 4: Recalculating all branches in parallel...`,
    );

    const recalculationPromises = impactData.affectedBranches.map(
      (branchImpact) =>
        recalculateBranchLedger(
          accountId,
          branchImpact.branchId,
          branchImpact.yearsToRecalculate,
          newOpeningBalance,
          openingBalanceType,
          companyFYConfig,
          session,
        ),
    );

    const branchResults = await Promise.all(recalculationPromises);

    console.log(`[Opening Balance Service] ✅ All branches recalculated`);

    // ========================================
    //  ✅  PHASE 5: Update outstanding associated with opening
    // ========================================

    console.log(
      ` ✅ [Opening Balance Service] Phase 5: Updating outstanding associated with opening...`,
    );

    console.log("accountId",accountId);
    
    const existingOutstanding = await OutstandingModel.findOne({
      transactionType: "opening_balance",
      account: accountId,
    }).session(session);

    if (existingOutstanding) {
      console.log(" Existing outstanding found to update.");
      const { totalReceipts, totalPayments } =
        await calculateReceiptPaymentTotals(existingOutstanding._id, session);

      // --------------------------------------
      // Normalize opening
      // --------------------------------------

      const openingSigned = normalizeAmount(
        newOpeningBalance,
        openingBalanceType,
      );

      // --------------------------------------
      // Calculate closing (signed math)
      // --------------------------------------

      const closingSigned =
        openingSigned +
        totalPayments - // DR increases balance
        totalReceipts; // CR decreases balance

      // --------------------------------------
      // Convert back to amount + type
      // --------------------------------------

      const { amount: closingBalance, type: closingType } =
        denormalizeAmount(closingSigned);

      console.log("openingSigned", openingSigned);
      console.log("totalReceipts", totalReceipts);
      console.log("totalPayments", totalPayments);
      console.log("closingSigned", closingSigned);
      console.log("closingBalance", closingBalance);
      console.log("closingType", closingType);

      // --------------------------------------
      // Save
      // --------------------------------------

      existingOutstanding.closingBalanceAmount = closingBalance;
      existingOutstanding.totalAmount =newOpeningBalance;
      existingOutstanding.outstandingType = closingType;
      existingOutstanding.lastUpdated = new Date();

      await existingOutstanding.save({ session });
    }

    // ========================================
    // PHASE 5: COMMIT TRANSACTION
    // ========================================
    console.log(
      `\n[Opening Balance Service] Phase 5: Committing transaction...`,
    );

    await session.commitTransaction();

    console.log(
      `[Opening Balance Service] ✅ Transaction committed successfully`,
    );

    // ========================================
    // PHASE 6: CALCULATE EXECUTION SUMMARY
    // ========================================
    const endTime = Date.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2) + "s";

    const totalTransactionsUpdated = branchResults.reduce(
      (sum, result) => sum + result.transactionsUpdated,
      0,
    );
    const totalMonthlyBalancesUpdated = branchResults.reduce(
      (sum, result) => sum + result.monthlyBalancesUpdated,
      0,
    );

    // Combine branch impact with results
    const affectedBranchesDetails = impactData.affectedBranches.map(
      (impact, index) => ({
        branchId: impact.branchId,
        branchName: impact.branchName,
        recalculatedYears: branchResults[index].yearsRecalculated,
        transactionsUpdated: branchResults[index].transactionsUpdated,
        monthlyBalancesUpdated: branchResults[index].monthlyBalancesUpdated,
      }),
    );

    console.log(
      `\n[Opening Balance Service] ========================================`,
    );
    console.log(`[Opening Balance Service] ✅ RECALCULATION COMPLETE`);
    console.log(
      `[Opening Balance Service] Total transactions updated: ${totalTransactionsUpdated}`,
    );
    console.log(
      `[Opening Balance Service] Total monthly balances updated: ${totalMonthlyBalancesUpdated}`,
    );
    console.log(`[Opening Balance Service] Execution time: ${executionTime}`);
    console.log(
      `[Opening Balance Service] ========================================\n`,
    );

    return {
      success: true,
      message: "Opening balance updated successfully",
      data: {
        oldOpeningBalance: impactData.oldOpeningBalance,
        oldOpeningBalanceType: impactData.oldOpeningBalanceType,
        newOpeningBalance,
        newOpeningBalanceType: openingBalanceType,
        affectedBranches: affectedBranchesDetails,
        totalTransactionsUpdated,
        totalMonthlyBalancesUpdated,
        executionTime,
      },
    };
  } catch (error) {
    console.error(
      `\n[Opening Balance Service] ❌ ERROR during recalculation:`,
      error,
    );

    // ========================================
    // ROLLBACK TRANSACTION ON ERROR
    // ========================================
    if (session) {
      console.log(`[Opening Balance Service] Rolling back transaction...`);
      await session.abortTransaction();
      console.log(`[Opening Balance Service] ✅ Transaction rolled back`);
    }

    throw error;
  } finally {
    // ========================================
    // CLEANUP: END SESSION
    // ========================================
    if (session) {
      session.endSession();
      console.log(`[Opening Balance Service] Session ended`);
    }
  }
};
