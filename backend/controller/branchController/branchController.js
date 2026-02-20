import BranchModel from "../../model/masters/BranchModel.js";
import mongoose from "mongoose";
import AccountMasterModel from "../../model/masters/AccountMasterModel.js";
import ItemMasterModel from "../../model/masters/ItemMasterModel.js";
import OutstandingModel from "../../model/OutstandingModel.js";
import {PaymentModel,ReceiptModel} from "../../model/FundTransactionMode.js";
import {SalesReturnModel,PurchaseReturnModel} from "../../model/TransactionModel.js";
import UserModel from "../../model/userModel.js";
import {PurchaseModel,SalesModel} from "../../model/TransactionModel.js";
// ✅ Create new branch
export const createBranch = async (req, res) => {
  try {
    const createdBy = req.user?._id;
    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user not found in request",
      });
    }

    const {
      companyId,
      branchName,
      address,
      city,
      state,
      country,
      pincode,
      email,
      mobile,
      landline,
      status,
    } = req.body;

    // 1️⃣ Validate required fields
    if (!companyId || !branchName || !email || !mobile) {
      return res.status(400).json({ 
        success: false,
        message: "Company ID, branch name, email, and mobile are required" 
      });
    }

    // 2️⃣ Check if branch already exists for this company
    const existingBranch = await BranchModel.findOne({ 
      companyId, 
      branchName 
    });
    
    if (existingBranch) {
      return res.status(409).json({ 
        success: false,
        message: "Branch with this name already exists for this company" 
      });
    }

    // 3️⃣ Prepare the new branch object
    const newBranch = new BranchModel({
      companyId,
      branchName,
      address,
      city,
      state,
      country: country || "India",
      pincode,
      email,
      mobile,
      landline,
      status: status || "active",
      createdBy,
    });

    // 4️⃣ Save to database
    const savedBranch = await newBranch.save();

    // 5️⃣ Return success response
    res.status(201).json({
      success: true,
      message: "Branch created successfully",
      data: savedBranch,
    });
  } catch (error) {
    console.error("Error creating branch:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create branch",
    });
  }
};

// ✅ Get all branches (with optional company filter)
export const getallBranches = async (req, res) => {
  try {
    const { companyId } = req.query;
    console.log("companyId:", companyId);

    const query = companyId ? { companyId } : {};
    const allbranches = await BranchModel.find(query).sort({ createdAt: -1 });

    return res.status(200).json({ 
      success: true,
      message: "Branches found", 
      data: allbranches 
    });
  } catch (error) {
    console.error("error:", error.message);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
};

// ✅ List branches with pagination and search
export const listBranches = async (req, res) => {
  try {
    const { searchTerm = "", limit = 30, skip = 0, companyId } = req.query;

    // Build query
    let query = {};
    
    // Filter by company if provided
    if (companyId) {
      query.companyId = companyId;
    }

    // Add search conditions
    if (searchTerm) {
      query.$or = [
        { branchName: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
        { state: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const branches = await BranchModel.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const totalCount = await BranchModel.countDocuments(query);
    const hasMore = parseInt(skip) + branches.length < totalCount;

    return res.status(200).json({
      success: true,
      data: branches,
      hasMore,
      totalCount,
      nextPage: hasMore ? parseInt(skip) + parseInt(limit) : null,
    });
  } catch (error) {
    console.error("Error listing branches:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch branches",
    });
  }
};

// ✅ Search branches
export const searchBranches = async (req, res) => {
  try {
    const { searchTerm = "", limit = 25, companyId } = req.query;

    // Build query
    let query = {};
    
    // Filter by company if provided
    if (companyId) {
      query.companyId = companyId;
    }

    // Add search conditions
    if (searchTerm) {
      query.$or = [
        { branchName: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { city: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const branches = await BranchModel.find(query)
      .limit(parseInt(limit))
      .select("branchName email mobile city state status companyId")
      .lean();

    return res.status(200).json({
      success: true,
      data: branches,
    });
  } catch (error) {
    console.error("Error searching branches:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to search branches",
    });
  }
};

// ✅ Get branch by ID
export const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;

    const branch = await BranchModel.findById(id).lean();

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: branch,
    });
  } catch (error) {
    console.error("Error fetching branch:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch branch",
    });
  }
};

// ✅ Update branch
export const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if branch exists
    const branch = await BranchModel.findById(id);
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Check if updating to a name that already exists (excluding current branch)
    if (updateData.branchName && updateData.branchName !== branch.branchName) {
      const existingBranch = await BranchModel.findOne({
        companyId: branch.companyId,
        branchName: updateData.branchName,
        _id: { $ne: id },
      });

      if (existingBranch) {
        return res.status(409).json({
          success: false,
          message: "Branch with this name already exists for this company",
        });
      }
    }

    // Update branch
    const updatedBranch = await BranchModel.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: "Branch updated successfully",
      data: updatedBranch,
    });
  } catch (error) {
    console.error("Error updating branch:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update branch",
    });
  }
};

// ✅ Delete branch
const isBranchReferenced = async (referencesToCheck, branchId) => {
  for (const ref of referencesToCheck) {
    const count = await ref.model.countDocuments({
      [ref.field]: branchId,
    });
    if (count > 0) {
      return true;
    }
  }
  return false;
};

export const deleteBranch = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;

    // Check if branch exists
    const branch = await BranchModel.findById(id);
    if (!branch) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Collections and fields to check for branch references
    const referencesToCheck = [
      { model: AccountMasterModel, field: "branches" },
      { model: ItemMasterModel, field: "branch" },
      { model: ReceiptModel, field: "branch" },
      { model: PaymentModel, field: "branch" },
      { model: PurchaseModel, field: "branch" },
      { model: SalesModel, field: "branch" },
      { model: UserModel, field: "branches" }, // If users are linked to branches
      { model: OutstandingModel, field: "branch" },
      { model: SalesReturnModel, field: "branch" },
      { model: PurchaseReturnModel, field: "branch" },
      // Add more models as needed
    ];

    // Check if branch is referenced in any collection
    const inUse = await isBranchReferenced(referencesToCheck, id);
    if (inUse) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Branch is used in accounts, transactions or other records and cannot be deleted.",
      });
    }

    // Delete the branch
    const result = await BranchModel.findByIdAndDelete(id, { session });
    if (!result) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Branch deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting branch:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete branch",
    });
  }
};
