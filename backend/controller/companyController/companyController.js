import CompanyModel from "../../model/masters/CompanyModel.js";
import mongoose from "mongoose";
import AccountMasterModel from "../../model/masters/AccountMasterModel.js";
import OutstandingModel from "../../model/OutstandingModel.js";
import { PaymentModel, ReceiptModel } from "../../model/FundTransactionMode.js";
import ItemMasterModel from "../../model/masters/ItemMasterModel.js";
import { PurchaseModel, SalesModel } from "../../model/TransactionModel.js";
import {
  SalesReturnModel,
  PurchaseReturnModel,
} from "../../model/TransactionModel.js";
import BranchModel from "../../model/masters/BranchModel.js";
import UserModel from "../../model/userModel.js"; // Import the UserModel
import AccountLedger from "../../model/AccountLedgerModel.js";
import ItemLedger from "../../model/ItemsLedgerModel.js";
import StockAdjustment from "../../model/StockAdjustmentModel.js";
import { computeFYDates } from "../../utils/financialYear.js";
import CompanySettingsModel from "../../model/CompanySettings.model.js";

// ✅ Create Company + default FY settings
export const createCompany = async (req, res) => {
  try {
    const {
      companyName,
      companyType,
      registrationNumber,
      incorporationDate,
      permanentAddress,
      residentialAddress,
      email,
      numEmployees,
      notificationEmail,
      mobile,
      landline,
      gstNumber,
      panNumber,
      website,
      industry,
      status,
      financialYear,
    } = req.body;

    if (!companyName || !email) {
      return res.status(400).json({
        success: false,
        message: "Company name and email are required",
      });
    }

    if (financialYear?.format) {
      const validFormats = [
        "april-march",
        "january-december",
        "february-january",
        "march-february",
        "may-april",
        "june-may",
        "july-june",
        "august-july",
        "september-august",
      ];

      if (!validFormats.includes(financialYear.format)) {
        return res.status(400).json({
          success: false,
          message: "Invalid financial year format",
        });
      }
    }

    const existingCompany = await CompanyModel.findOne({ companyName });
    if (existingCompany) {
      return res.status(409).json({
        success: false,
        message: "Company already exists",
      });
    }

    // Map frontend startingYear into schema (if you have startYear in schema, map to that instead)
    const fyPayload = financialYear
      ? {
          ...financialYear,
          startingYear: financialYear.startingYear,
        }
      : { format: "april-march" };

    const newCompany = new CompanyModel({
      companyName,
      companyType,
      registrationNumber,
      incorporationDate,
      permanentAddress,
      residentialAddress,
      email,
      notificationEmail,
      mobile,
      landline,
      gstNumber,
      panNumber,
      website,
      industry,
      numEmployees,
      status: status || "Active",
      financialYear: fyPayload,
    });

    const savedCompany = await newCompany.save();

    const companyId = savedCompany._id.toString();
    const fyFormat = savedCompany.financialYear?.format || "april-march";

    // 🔹 Use the selected startingYear as the FY start year
    const startYearFromBody = financialYear?.startingYear;
    const startYear =
      startYearFromBody && Number.isInteger(Number(startYearFromBody))
        ? Number(startYearFromBody)
        : new Date().getFullYear(); // fallback if not provided / invalid

    // For Jan–Dec, FY is within same year; for other formats, it spans to next year
    const endYear =
      fyFormat === "january-december" ? startYear : startYear + 1;

    const defaultFY = `${startYear}-${endYear}`; // e.g. "2025-2026"

    // computeFYDates already respects Jan–Dec as same year via fyFormat logic
    const { startDate, endDate } = computeFYDates(defaultFY, fyFormat);

    const companySettings = await CompanySettingsModel.create({
      company: companyId,
      financialYear: {
        currentFY: defaultFY,
        startDate,
        endDate,
        lastChangedAt: new Date(),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Company created successfully",
      data: { savedCompany, companySettings },
    });
  } catch (error) {
    console.error("Error creating company:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create company",
    });
  }
};



// Get company by ID
export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await CompanyModel.findById(id).lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error("Error fetching company:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch company",
    });
  }
};

// Helper function to check if company has transactions
const hasTransactions = async (companyId, transactionId = null) => {
  const query = { company: companyId, isCancelled: false };
  if (transactionId) {
    query._id = { $ne: transactionId };
  }

  const collections = [
    SalesModel,
    PurchaseModel,
    SalesReturnModel,
    PurchaseReturnModel,
    ReceiptModel,
    PaymentModel,
    StockAdjustment,
  ];

  for (const Model of collections) {
    const count = await Model.countDocuments(query).limit(1);
    if (count > 0) {
      return true; // Exit immediately
    }
  }

  return false;
};

// ✅ Update company (with FY format + start year lock)
export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const company = await CompanyModel.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    let formatChanged = false;
    let yearChanged = false; // NEW

    // 🔒 Check if trying to update Financial Year FORMAT (months)
    if (
      updateData.financialYear?.format &&
      updateData.financialYear.format !== company.financialYear?.format
    ) {
      if (company.financialYear?.formatLocked) {
        return res.status(403).json({
          success: false,
          message:
            "Financial year format (months) is locked and cannot be changed after transactions exist. You can still change the year.",
          formatLockedAt: company.financialYear.formatLockedAt,
          formatLockedReason: company.financialYear.formatLockedReason,
        });
      }

      const hasTransactionsFlag = await hasTransactions(id);

      if (hasTransactionsFlag) {
        company.financialYear.formatLocked = true;
        company.financialYear.formatLockedAt = new Date();
        company.financialYear.formatLockedReason =
          "Transactions exist in Sales/Purchase/Receipts/Payments/etc.";
        await company.save();

        return res.status(403).json({
          success: false,
          message:
            "Cannot change financial year format (months). Transactions already exist. You can still change the year.",
          hasTransactions: true,
        });
      }

      formatChanged = true;
    }

    // 🔒 NEW: block startingYear change when formatLocked
    if (
      updateData.financialYear?.startingYear !== undefined &&
      updateData.financialYear.startingYear !==
        company.financialYear?.startingYear
    ) {
      if (company.financialYear?.formatLocked) {
        return res.status(403).json({
          success: false,
          message:
            "Financial year starting year is locked and cannot be changed after transactions exist.",
          formatLockedAt: company.financialYear.formatLockedAt,
          formatLockedReason: company.financialYear.formatLockedReason,
        });
      }

      yearChanged = true;
    }

    // 🔧 Preserve existing FY data when updating other fields + map startingYear
    if (updateData.financialYear) {
      updateData.financialYear = {
        ...company.financialYear.toObject(),
        ...updateData.financialYear,
      };
    }

    // name uniqueness (unchanged)
    if (
      updateData.companyName &&
      updateData.companyName !== company.companyName
    ) {
      const existingCompany = await CompanyModel.findOne({
        companyName: updateData.companyName,
        _id: { $ne: id },
      });

      if (existingCompany) {
        return res.status(409).json({
          success: false,
          message: "Company with this name already exists",
        });
      }
    }

    Object.assign(company, updateData);
    const updatedCompany = await company.save();

    // 🔁 If FY format changed OR starting year changed, ensure settings exist and recalc dates
    if (formatChanged || yearChanged) {
      const companyId = updatedCompany._id.toString();

      let settings = await CompanySettingsModel.findOne({ company: companyId });

      // Determine startYear from company.financialYear.startingYear (or fallback)
      const fy = updatedCompany.financialYear || {};
      const startYear =
        fy.startingYear && Number.isInteger(Number(fy.startingYear))
          ? Number(fy.startingYear)
          : (() => {
              const now = new Date();
              return now.getFullYear();
            })();

      const fyFormat = fy.format || "april-march";

      const endYear =
        fyFormat === "january-december" ? startYear : startYear + 1;

      const currentFY = `${startYear}-${endYear}`;

      const { startDate, endDate } = computeFYDates(currentFY, fyFormat);

      if (!settings) {
        settings = new CompanySettingsModel({
          company: companyId,
          financialYear: {
            currentFY,
            startDate,
            endDate,
            lastChangedAt: new Date(),
          },
        });
      } else {
        settings.financialYear.currentFY = currentFY;
        settings.financialYear.startDate = startDate;
        settings.financialYear.endDate = endDate;
        settings.financialYear.lastChangedAt = new Date();
      }

      await settings.save();
    }

    return res.status(200).json({
      success: true,
      message: "Company updated successfully",
      data: updatedCompany,
    });
  } catch (error) {
    console.error("Error updating company:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update company",
    });
  }
};



// 🔒 Lock Financial Year FORMAT (call this when first transaction is created)
export const lockFinancialYearFormat = async (companyId, session) => {
  try {
    const company = await CompanyModel.findById(companyId);

    if (!company) {
      throw new Error("Company not found");
    }

    if (!company.financialYear?.formatLocked) {
      company.financialYear.formatLocked = true;
      company.financialYear.formatLockedAt = new Date();
      company.financialYear.formatLockedReason = "First transaction created";
      await company.save({ session });
    }

    return company;
  } catch (error) {
    console.error("Error locking financial year format:", error);
    throw error;
  }
};

/// 🆕 Unlock Financial Year FORMAT if no transactions exist

export const unlockFinancialYearFormatIfNoTransactions = async (
  companyId,
  session,
  transactionId,
) => {
  const company = await CompanyModel.findById(companyId);

  if (!company.financialYear?.formatLocked) {
    return company; // Already unlocked
  }

  // Check if any transactions still exist
  const hasTransactionsFlag = await hasTransactions(companyId, transactionId);

  console.log("hasTransactionsFlag:", hasTransactionsFlag);

  // If no transactions, unlock the format
  if (!hasTransactionsFlag) {
    company.financialYear.formatLocked = false;
    company.financialYear.formatLockedAt = null;
    company.financialYear.formatLockedReason = null;
    await company.save({ session });
  }

  return company;
};

// 🆕 Update Financial Year (year only, format remains locked if transactions exist)
export const updateFinancialYear = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentFY } = req.body; // e.g., "2026-27"

    if (!currentFY || !/^\d{4}-\d{2}$/.test(currentFY)) {
      return res.status(400).json({
        success: false,
        message: "Invalid FY format. Expected format: YYYY-YY (e.g., 2026-27)",
      });
    }

    const company = await CompanyModel.findById(id);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Update year using the method
    company.updateFYYear(currentFY);
    await company.save();

    return res.status(200).json({
      success: true,
      message: "Financial year updated successfully",
      data: {
        currentFY: company.financialYear.currentFY,
        fyStartDate: company.financialYear.fyStartDate,
        fyEndDate: company.financialYear.fyEndDate,
        formatLocked: company.financialYear.formatLocked,
      },
    });
  } catch (error) {
    console.error("Error updating financial year:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update financial year",
    });
  }
};

// Check FY lock status
export const checkFYLockStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await CompanyModel.findById(id)
      .select("financialYear")
      .lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const hasTransactionsFlag = await hasTransactions(id);

    return res.status(200).json({
      success: true,
      data: {
        formatLocked: company.financialYear?.formatLocked || false,
        formatLockedAt: company.financialYear?.formatLockedAt || null,
        formatLockedReason: company.financialYear?.formatLockedReason || null,
        hasTransactions: hasTransactionsFlag,
        canModifyFormat:
          !company.financialYear?.formatLocked && !hasTransactionsFlag,
        canModifyYear: true, // ✅ Year can always be modified
        currentFY: company.financialYear?.currentFY,
        format: company.financialYear?.format,
      },
    });
  } catch (error) {
    console.error("Error checking FY lock status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check FY lock status",
    });
  }
};

// ✅ Your existing getallCompanies function
export const getallCompanies = async (req, res) => {
  try {
    const allcompanies = await CompanyModel.find({});
    return res.status(200).json({
      success: true,
      message: "Companies found",
      data: allcompanies,
    });
  } catch (error) {
    console.log("error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ✅ NEW: List companies with pagination and search
export const listCompanies = async (req, res) => {
  try {
    const { searchTerm = "", limit = 30, skip = 0 } = req.query;

    const query = searchTerm
      ? {
          $or: [
            { companyName: { $regex: searchTerm, $options: "i" } },
            { email: { $regex: searchTerm, $options: "i" } },
            { mobile: { $regex: searchTerm, $options: "i" } },
            { registrationNumber: { $regex: searchTerm, $options: "i" } },
          ],
        }
      : {};

    const companies = await CompanyModel.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const totalCount = await CompanyModel.countDocuments(query);
    const hasMore = parseInt(skip) + companies.length < totalCount;

    return res.status(200).json({
      success: true,
      data: companies,
      hasMore,
      totalCount,
      nextPage: hasMore ? parseInt(skip) + parseInt(limit) : null,
    });
  } catch (error) {
    console.error("Error listing companies:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch companies",
    });
  }
};

// ✅ NEW: Search companies
export const searchCompanies = async (req, res) => {
  try {
    const { searchTerm = "", limit = 25 } = req.query;

    const query = searchTerm
      ? {
          $or: [
            { companyName: { $regex: searchTerm, $options: "i" } },
            { email: { $regex: searchTerm, $options: "i" } },
            { mobile: { $regex: searchTerm, $options: "i" } },
          ],
        }
      : {};

    const companies = await CompanyModel.find(query)
      .limit(parseInt(limit))
      .select("companyName email mobile status companyType")
      .lean();

    return res.status(200).json({
      success: true,
      data: companies,
    });
  } catch (error) {
    console.error("Error searching companies:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to search companies",
    });
  }
};

// ✅ NEW: Delete company
const isCompanyReferenced = async (referencesToCheck, companyId) => {
  for (const ref of referencesToCheck) {
    const count = await ref.model.countDocuments({
      [ref.field]: companyId,
    });
    if (count > 0) {
      return true;
    }
  }
  return false;
};

export const deleteCompany = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;

    // Check if company exists
    const company = await CompanyModel.findById(id);
    if (!company) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Collections and fields to check for company references
    const referencesToCheck = [
      { model: BranchModel, field: "companyId" },
      { model: AccountMasterModel, field: "company" },
      { model: ItemMasterModel, field: "company" },
      { model: ReceiptModel, field: "company" },
      { model: PaymentModel, field: "company" },
      { model: PurchaseModel, field: "company" },
      { model: SalesModel, field: "company" },
      { model: UserModel, field: "company" },
      { model: SalesReturnModel, field: "company" },
      { model: PurchaseReturnModel, field: "company" },
      // If users are linked to companies
      // Add more models as needed
    ];

    // Check if company is referenced in any collection
    const inUse = await isCompanyReferenced(referencesToCheck, id);
    if (inUse) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Company is used in branches, accounts, transactions or other records and cannot be deleted.",
      });
    }

    // Delete the company
    const result = await CompanyModel.findByIdAndDelete(id, { session });
    if (!result) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Optionally: Delete related data if needed
    // await BranchModel.deleteMany({ company: id }, { session });
    // await AccountMasterModel.deleteMany({ company: id }, { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Company deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting company:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete company",
    });
  }
};
