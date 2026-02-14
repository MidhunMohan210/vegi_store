import { calculateReceiptPaymentTotals } from "../../helpers/transactionHelpers/outstandingService.js";
import OutstandingModel from "../../model/OutstandingModel.js";
import {
  analyzeOpeningBalanceImpact,
  executeOpeningBalanceUpdate,
} from "../../services/openingBalance/openingBalance.service.js";

/**
 * ============================================
 * OPENING BALANCE CONTROLLER
 * ============================================
 *
 * Purpose: Handle HTTP requests for opening balance updates
 *
 * Endpoints:
 * 1. POST /api/opening-balance/analyze - Analyze impact (warning generation)
 * 2. POST /api/opening-balance/update - Execute update (after user confirmation)
 *
 * Flow:
 * Step 1: Frontend calls /analyze endpoint
 * Step 2: Backend returns warning with impact analysis
 * Step 3: User confirms in frontend
 * Step 4: Frontend calls /update endpoint with confirmation
 * Step 5: Backend executes recalculation
 * Step 6: Returns detailed success/failure result
 *
 * ============================================
 */

/**
 * Analyze the impact of changing opening balance
 * This is a READ-ONLY operation that returns warning data
 *
 * Route: POST /api/opening-balance/analyze
 * Query Params: companyId, branchId (for authentication/context)
 * Body: {
 *   entityType: "party",
 *   entityId: "6969f945b219a9a19eb7af62",
 *   newOpeningBalance: 2000,
 *   openingBalanceType: "dr"
 * }
 *
 * Response: {
 *   success: true,
 *   data: {
 *     accountName: "ABC Traders",
 *     oldOpeningBalance: 10000,
 *     newOpeningBalance: 2000,
 *     affectedBranches: [...],
 *     totalTransactions: 2500,
 *     estimatedTime: "12s"
 *   }
 * }
 */
export const analyzeOpeningBalanceImpactController = async (req, res) => {
  console.log(`\n============================================`);
  console.log(`[Controller] ANALYZE OPENING BALANCE IMPACT`);
  console.log(`============================================`);
  console.log(`Request received at: ${new Date().toISOString()}`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log(`Query:`, req.query);
  console.log(`Body:`, req.body);
  console.log(`============================================\n`);

  try {
    // ========================================
    // STEP 1: EXTRACT & VALIDATE REQUEST DATA
    // ========================================
    console.log(`[Controller] Step 1: Extracting request data...`);

    const { companyId, branchId } = req.query;
    const { entityType, entityId, newOpeningBalance, openingBalanceType } =
      req.body;

    // Validate required fields
    if (!companyId) {
      console.log(`[Controller] ❌ Missing companyId in query`);
      return res.status(400).json({
        success: false,
        error: "MISSING_COMPANY_ID",
        message: "Company ID is required",
      });
    }

    if (!entityId) {
      console.log(`[Controller] ❌ Missing entityId in body`);
      return res.status(400).json({
        success: false,
        error: "MISSING_ENTITY_ID",
        message: "Entity ID is required",
      });
    }

    if (newOpeningBalance === undefined || newOpeningBalance === null) {
      console.log(`[Controller] ❌ Missing newOpeningBalance in body`);
      return res.status(400).json({
        success: false,
        error: "MISSING_OPENING_BALANCE",
        message: "New opening balance is required",
      });
    }

    if (!openingBalanceType || !["dr", "cr"].includes(openingBalanceType)) {
      console.log(
        `[Controller] ❌ Invalid openingBalanceType: ${openingBalanceType}`,
      );
      return res.status(400).json({
        success: false,
        error: "INVALID_BALANCE_TYPE",
        message: 'Opening balance type must be "dr" or "cr"',
      });
    }

    // Currently only supporting "party" entity type
    if (entityType !== "party") {
      console.log(`[Controller] ❌ Unsupported entityType: ${entityType}`);
      return res.status(400).json({
        success: false,
        error: "UNSUPPORTED_ENTITY_TYPE",
        message: 'Only "party" entity type is currently supported',
      });
    }

    console.log(`[Controller] ✅ Request validation passed`);
    console.log(`[Controller] Company: ${companyId}`);
    console.log(`[Controller] Account: ${entityId}`);
    console.log(
      `[Controller] New Balance: ${newOpeningBalance} (${openingBalanceType})`,
    );

    // ========================================
    // STEP 2: CALL SERVICE FUNCTION
    // ========================================
    console.log(`\n[Controller] Step 2: Calling service function...`);

    const result = await analyzeOpeningBalanceImpact(
      companyId,
      entityId,
      newOpeningBalance,
      openingBalanceType,
    );

    // ========================================
    // STEP 3: HANDLE SERVICE RESPONSE
    // ========================================
    console.log(`\n[Controller] Step 3: Processing service response...`);

    if (!result.success) {
      console.log(`[Controller] ⚠️ Service returned error: ${result.error}`);

      // Determine HTTP status code based on error type
      let statusCode = 400;
      if (
        result.error === "ACCOUNT_NOT_FOUND" ||
        result.error === "COMPANY_NOT_FOUND"
      ) {
        statusCode = 404;
      } else if (result.error === "DIRTY_DATA") {
        statusCode = 409; // Conflict
      }

      return res.status(statusCode).json(result);
    }

    // ========================================
    // STEP 4: RETURN SUCCESS RESPONSE
    // ========================================
    console.log(`[Controller] ✅ Analysis complete, returning result`);
    console.log(
      `[Controller] Affected branches: ${result.data.affectedBranches.length}`,
    );
    console.log(
      `[Controller] Total transactions: ${result.data.totalTransactions}`,
    );
    console.log(`[Controller] ============================================\n`);

    return res.status(200).json(result);
  } catch (error) {
    // ========================================
    // ERROR HANDLING
    // ========================================
    console.error(`\n[Controller] ❌ UNHANDLED ERROR:`, error);
    console.error(`[Controller] Stack trace:`, error.stack);

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "An error occurred while analyzing opening balance impact",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Execute opening balance update with recalculation
 * This is a WRITE operation that modifies data
 * Should only be called after user confirms the warning from /analyze
 *
 * Route: POST /api/opening-balance/update
 * Query Params: companyId, branchId (for authentication/context)
 * Body: {
 *   entityType: "party",
 *   entityId: "6969f945b219a9a19eb7af62",
 *   newOpeningBalance: 2000,
 *   openingBalanceType: "dr",
 *   impactData: { ... } // Data from /analyze endpoint
 * }
 *
 * Response: {
 *   success: true,
 *   message: "Opening balance updated successfully",
 *   data: {
 *     oldOpeningBalance: 10000,
 *     newOpeningBalance: 2000,
 *     affectedBranches: [
 *       {
 *         branchId: "...",
 *         branchName: "Main Office",
 *         recalculatedYears: ["2024-2025", "2025-2026"],
 *         transactionsUpdated: 1245,
 *         monthlyBalancesUpdated: 22
 *       }
 *     ],
 *     totalTransactionsUpdated: 2500,
 *     totalMonthlyBalancesUpdated: 48,
 *     executionTime: "11.5s"
 *   }
 * }
 */
export const updateOpeningBalanceController = async (req, res) => {
  console.log(`\n============================================`);
  console.log(`[Controller] UPDATE OPENING BALANCE`);
  console.log(`============================================`);
  console.log(`Request received at: ${new Date().toISOString()}`);
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.path}`);
  console.log(`Query:`, req.query);
  console.log(`Body (without impactData):`, {
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    newOpeningBalance: req.body.newOpeningBalance,
    openingBalanceType: req.body.openingBalanceType,
  });
  console.log(`============================================\n`);

  try {
    // ========================================
    // STEP 1: EXTRACT & VALIDATE REQUEST DATA
    // ========================================
    console.log(`[Controller] Step 1: Extracting request data...`);

    const { companyId, branchId } = req.query;
    const {
      entityType,
      entityId,
      newOpeningBalance,
      openingBalanceType,
      impactData,
    } = req.body;

    // Validate required fields
    if (!companyId) {
      console.log(`[Controller] ❌ Missing companyId in query`);
      return res.status(400).json({
        success: false,
        error: "MISSING_COMPANY_ID",
        message: "Company ID is required",
      });
    }

    if (!entityId) {
      console.log(`[Controller] ❌ Missing entityId in body`);
      return res.status(400).json({
        success: false,
        error: "MISSING_ENTITY_ID",
        message: "Entity ID is required",
      });
    }

    if (newOpeningBalance === undefined || newOpeningBalance === null) {
      console.log(`[Controller] ❌ Missing newOpeningBalance in body`);
      return res.status(400).json({
        success: false,
        error: "MISSING_OPENING_BALANCE",
        message: "New opening balance is required",
      });
    }

    if (!openingBalanceType || !["dr", "cr"].includes(openingBalanceType)) {
      console.log(
        `[Controller] ❌ Invalid openingBalanceType: ${openingBalanceType}`,
      );
      return res.status(400).json({
        success: false,
        error: "INVALID_BALANCE_TYPE",
        message: 'Opening balance type must be "dr" or "cr"',
      });
    }

    if (!impactData || !impactData.affectedBranches) {
      console.log(`[Controller] ❌ Missing impactData in body`);
      return res.status(400).json({
        success: false,
        error: "MISSING_IMPACT_DATA",
        message:
          "Impact data from analysis is required. Please call /analyze endpoint first.",
      });
    }

    // Currently only supporting "party" entity type
    if (entityType !== "party") {
      console.log(`[Controller] ❌ Unsupported entityType: ${entityType}`);
      return res.status(400).json({
        success: false,
        error: "UNSUPPORTED_ENTITY_TYPE",
        message: 'Only "party" entity type is currently supported',
      });
    }

    console.log(`[Controller] ✅ Request validation passed`);
    console.log(`[Controller] Company: ${companyId}`);
    console.log(`[Controller] Account: ${entityId}`);
    console.log(
      `[Controller] New Balance: ${newOpeningBalance} (${openingBalanceType})`,
    );
    console.log(
      `[Controller] Affected branches: ${impactData.affectedBranches.length}`,
    );

    // ========================================
    // STEP 2: CALL SERVICE FUNCTION
    // ========================================
    console.log(`\n[Controller] Step 2: Calling recalculation service...`);

    const result = await executeOpeningBalanceUpdate(
      companyId,
      entityId,
      newOpeningBalance,
      openingBalanceType,
      impactData,
    );

  

    // ========================================
    // STEP 3: RETURN SUCCESS RESPONSE
    // ========================================
    console.log(`\n[Controller] ✅ Recalculation complete, returning result`);
    console.log(
      `[Controller] Transactions updated: ${result.data.totalTransactionsUpdated}`,
    );
    console.log(
      `[Controller] Monthly balances updated: ${result.data.totalMonthlyBalancesUpdated}`,
    );
    console.log(`[Controller] Execution time: ${result.data.executionTime}`);
    console.log(`[Controller] ============================================\n`);

    return res.status(200).json(result);
  } catch (error) {
    // ========================================
    // ERROR HANDLING
    // ========================================
    console.error(`\n[Controller] ❌ UNHANDLED ERROR:`, error);
    console.error(`[Controller] Stack trace:`, error.stack);

    return res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "An error occurred while updating opening balance",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
