// controllers/openingBalanceController.js

import OpeningBalanceService from "../../services/openingBalance/OpeningBalanceService.js";

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
