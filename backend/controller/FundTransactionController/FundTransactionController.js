import mongoose from "mongoose";
import { getTransactionModel } from "../../helpers/FundTransactionHelper/FundTransactionHelper.js";
import { createFundTransaction, editFundTransaction } from "../../services/fundTransactionService/fundTransactionService.js";

/**
 * Create a new cash transaction (Receipt or Payment)
 * Handles the complete flow:
 * 1. Validate input data
 * 2. Create transaction record for party account
 * 3. Update account outstanding balance
 * 4. Settle outstanding records using FIFO
 * 5. Get Cash/Bank account from AccountMaster
 * 6. Create Cash/Bank ledger entry
 */
export const createFundTransactionController = async (req, res) => {
  try {

    const { transactionType } = req.params;

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in token. Please login again.",
      });
    }

    const result = await createFundTransaction({
      ...req.body,
      transactionType: transactionType.toLowerCase(),
      user: req.user,
    });

    res.status(201).json({
      success: true,
      message: `${
        transactionType.charAt(0).toUpperCase() + transactionType.slice(1)
      } created successfully`,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create transaction",
      error: error.message,
    });
  }
};

/**
 * Get transaction by ID
 */
export const getTransactionById = async (req, res) => {
  try {
    const { id, transactionType } = req.params;

    if (
      !transactionType ||
      !["receipt", "payment"].includes(transactionType.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid transaction type (receipt/payment) is required in URL",
      });
    }

    const TransactionModel = getTransactionModel(transactionType);
    const transaction = await TransactionModel.findById(id)
      .populate("account", "accountName accountType phoneNo")
      .populate("settlementDetails.outstandingTransaction")
      .populate("company", "name")
      .populate("branch", "name");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
      error: error.message,
    });
  }
};

/**
 * Get all transactions with filters
 */
export const getTransactions = async (req, res) => {
  try {
    const { transactionType } = req.params;

    // Validate transaction type first
    if (
      !transactionType ||
      !["receipt", "payment"].includes(transactionType.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid transaction type (receipt/payment) is required in URL",
      });
    }

    const TransactionModel = getTransactionModel(transactionType);

    // Get query parameters with proper defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const searchTerm = req.query.searchTerm || "";
    const sortBy = req.query.sortBy || "transactionDate"; // ✅ Fixed: was "date"
    const sortOrder = req.query.sortOrder || "desc";
    const accountId = req.query.accountId || req.query.account;
    const company = req.query.company || req.query.companyId;
    const branch = req.query.branch || req.query.branchId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const paymentMode = req.query.paymentMode;

    // Build sort object
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sort = {
      [sortBy]: sortDirection,
      _id: sortDirection, // Secondary sort for consistency
    };

    // Build filter (not query!) - ✅ This was your main error
    const filter = {};

    if (searchTerm) {
      filter.$or = [
        { accountName: { $regex: searchTerm, $options: "i" } },
        { transactionNumber: { $regex: searchTerm, $options: "i" } },
      ];
    }
    if (accountId) filter.account = accountId; // ✅ Fixed: was query.account
    if (company) filter.company = company;     // ✅ Fixed: was query.company
    if (branch) filter.branch = branch;        // ✅ Fixed: was query.branch
    if (paymentMode) filter.paymentMode = paymentMode; // ✅ Fixed: was query.paymentMode

    if (startDate || endDate) {
      filter.transactionDate = {}; // ✅ Fixed: was filter.date
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }

    // ✅ Use the static method - Remove duplicate manual query
    const result = await TransactionModel.getPaginatedTransactions(
      filter,
      page,
      limit,
      sort
    );

    // Transform data for frontend table
    const formattedTransactions = result.data.map((transaction) => ({
      _id: transaction._id,
      transactionNumber: transaction.transactionNumber || "N/A",
      transactionDate: transaction.transactionDate,
      accountName: transaction.account?.accountName || "N/A",
      previousBalanceAmount: transaction.previousBalanceAmount || 0,
      amount: transaction.amount || 0,
      closingBalanceAmount: transaction.closingBalanceAmount || 0,
      status: (transaction.closingBalanceAmount || 0) === 0 ? "paid" : "unpaid",
    }));

    res.status(200).json({
      success: true,
      data: formattedTransactions,
        totalCount: result.pagination.total,
      pagination: result.pagination
    });

  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};
/**
 * Delete/Cancel transaction
 */
export const deleteTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id, transactionType } = req.params;

    if (
      !transactionType ||
      !["receipt", "payment"].includes(transactionType.toLowerCase())
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Valid transaction type (receipt/payment) is required in URL",
      });
    }

    const TransactionModel = getTransactionModel(transactionType);
    const transaction = await TransactionModel.findById(id).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Reverse outstanding settlements
    const { reverseOutstandingSettlement } = await import(
      "../../Helper/OutstandingSettlement.js"
    );
    await reverseOutstandingSettlement({
      transactionId: id,
      settlementDetails: transaction.settlementDetails,
      accountId: transaction.account,
      amount: transaction.amount,
      transactionType: transactionType.toLowerCase(),
      userId: req.user?._id,
      session,
    });

    // Reverse cash/bank ledger entry
    const { reverseCashBankLedgerEntry } = await import(
      "../../Helper/CashBankLedgerHelper.js"
    );
    await reverseCashBankLedgerEntry({
      transactionId: id,
      userId: req.user?._id,
      reason: "Transaction deleted",
      session,
    });

    // Delete transaction
    await TransactionModel.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error deleting transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};


/**
 * Edit an existing Receipt or Payment transaction
 * 
 * @route PUT /api/fund-transactions/:transactionType/:transactionId
 * @access Private
 * 
 * Workflow:
 * 1. Validate edit request and permissions
 * 2. Reverse outstanding settlements (mark as reversed)
 * 3. Reverse cash/bank ledger entry
 * 4. Update the transaction record itself
 * 5. Re-run FIFO settlement with new amount
 * 6. Create new cash/bank ledger entry
 * 7. Mark monthly balance as dirty (for night job)
 * 8. Create adjustment entry for audit trail
 */
export const editFundTransactionController = async (req, res) => {
  try {
    
    const { transactionType, transactionId } = req.params;

    console.log("Edit request params:", req.params);

    // Validate user authentication
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in token. Please login again.",
      });
    }

    // Validate transaction type
    if (!["receipt", "payment"].includes(transactionType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Transaction type must be "receipt" or "payment"',
      });
    }

    // Call main edit service
    const result = await editFundTransaction({
      transactionId,
      transactionType: transactionType.toLowerCase(),
      updateData: req.body,
      user: req.user,
    });

    // console.log("result",result);
    

    res.status(200).json({
      success: true,
      message: `${
        transactionType.charAt(0).toUpperCase() + transactionType.slice(1)
      } updated successfully`,
      data: result,
    });
  } catch (error) {
    console.error("Edit fund transaction error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update transaction",
      error: error.message,
    });
  }
};
