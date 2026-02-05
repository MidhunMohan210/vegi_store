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

    // 1) Validate required fields
    if (!companyName || !email) {
      return res.status(400).json({
        success: false,
        message: "Company name and email are required",
      });
    }

    // 2) Validate financialYear format if provided
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

    // 3) Check if company already exists
    const existingCompany = await CompanyModel.findOne({ companyName });
    if (existingCompany) {
      return res.status(409).json({
        success: false,
        message: "Company already exists",
      });
    }

    // 4) Create company (format only matters here)
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
      financialYear: financialYear || { format: "april-march" },
    });

    const savedCompany = await newCompany.save();

    // 5) Create default FY settings for this company
    const companyId = savedCompany._id.toString();
    const fyFormat = savedCompany.financialYear?.format || "april-march";

    // Default year: based on current date
    const now = new Date();
    const year = now.getFullYear();
    const nextYear = year + 1;
    const defaultFY = `${year}-${nextYear}`; // "2026-2027"

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

    // 6) Response
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

// ✅ Update company (with FY format lock + settings sync)
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

      // No transactions → format can be changed
      formatChanged = true;
    }

    // 🔧 Preserve existing FY data when updating other fields
    if (updateData.financialYear) {
      updateData.financialYear = {
        ...company.financialYear.toObject(),
        ...updateData.financialYear,
      };
    }

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

    // 🔁 If FY format changed, ensure settings exist and recalc dates
    if (formatChanged) {
      const companyId = updatedCompany._id.toString();

      let settings = await CompanySettingsModel.findOne({ company: companyId });

      // Determine currentFY to use for settings:
      // 1) existing settings.currentFY
      // 2) company.financialYear.currentFY (if you still fill it)
      // 3) fallback from current date
      let currentFY;
      if (settings?.financialYear?.currentFY) {
        currentFY = settings.financialYear.currentFY;
      } else if (updatedCompany.financialYear?.currentFY) {
        // if format is "2025-26", normalise to "2025-2026"
        const parts = updatedCompany.financialYear.currentFY.split("-");
        if (parts.length === 2 && parts[1].length === 2) {
          const start = parseInt(parts[0], 10);
          const end = start + 1;
          currentFY = `${start}-${end}`;
        } else {
          currentFY = updatedCompany.financialYear.currentFY;
        }
      } else {
        const now = new Date();
        const y = now.getFullYear();
        currentFY = `${y}-${y + 1}`;
      }

      const fyFormat = updatedCompany.financialYear.format || "april-march";
      const { startDate, endDate } = computeFYDates(currentFY, fyFormat);

      if (!settings) {
        // No settings yet → create
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
        // Update existing
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
