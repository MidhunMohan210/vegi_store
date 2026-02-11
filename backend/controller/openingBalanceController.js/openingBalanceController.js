// controllers/openingBalanceController.js

import OpeningBalanceService from "../../services/openingBalance/OpeningBalanceService.js";
import Company from "../../model/masters/CompanyModel.js";
import AccountMonthlyBalance from "../../model/AccountMonthlyBalanceModel.js";
import mongoose from "mongoose";

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
