import mongoose from "mongoose";
import {
  validateTransactionData,
  getTransactionModel,
  prepareTransactionData,
  validateEditRequest,
} from "../../helpers/FundTransactionHelper/FundTransactionHelper.js";
import {
  deleteOutstandingSettlements,
  settleOutstandingFIFO,
} from "../../helpers/FundTransactionHelper/OutstandingSettlementHelper.js";
import {
  createCashBankLedgerEntry,
  deleteCashBankLedger,
} from "../../helpers/CommonTransactionHelper/CashBankLedgerHelper.js";
import { getCashBankAccountForPayment } from "../../helpers/CommonTransactionHelper/CashBankAccountHelper.js";
import { createAccountLedger } from "../../helpers/CommonTransactionHelper/ledgerService.js";
import {
  markMonthlyBalanceDirtyForFundTransaction,
  updateAccountMonthlyBalance,
} from "../../helpers/CommonTransactionHelper/monthlyBalanceService.js";
import AccountMaster from "../../model/masters/AccountMasterModel.js";
import { calculateFundTransactionDeltas } from "../../helpers/transactionHelpers/calculationHelper.js";
import { createFundTransactionAdjustmentEntry, createFundTransactionDeletionAdjustmentEntry } from "../../helpers/transactionHelpers/adjustmentEntryHelper.js";
// import { createFundTransactionAdjustmentEntry } from "../helpers/transactionHelpers/adjustmentEntryHelper.js";


/**
 * Creates a fund transaction (receipt or payment)
 * @param {Object} data - Transaction data
 * @param {String} data.transactionType - 'receipt' or 'payment'
 * @param {Object} data.user - User object with _id
 * @param {mongoose.ClientSession} [session] - Optional MongoDB session
 * @returns {Promise<Object>} Transaction result
 */
export const createFundTransaction = async (data, session = null) => {
  console.log("data", data);

  // Determine if we need to manage session lifecycle
  const shouldManageSession = !session;
  const activeSession = session || (await mongoose.startSession());

  if (shouldManageSession) {
    activeSession.startTransaction();
  }

  try {
    const { transactionType, user, ...requestData } = data;

    // Validate transaction type
    if (
      !transactionType ||
      !["receipt", "payment"].includes(transactionType.toLowerCase())
    ) {
      throw new Error(
        'Invalid transaction type. Must be "receipt" or "payment"'
      );
    }

    // Validate user
    if (!user?._id) {
      throw new Error("User ID not found. Please login again.");
    }

    // Merge transaction type
    const transactionData = {
      ...requestData,
      transactionType: transactionType.toLowerCase(),
    };

    // Step 1: Validate transaction data
    const validationError = await validateTransactionData(
      transactionData,
      activeSession
    );
    if (validationError) {
      throw new Error(validationError.message);
    }

    const { account, amount } = transactionData;
    const finalAccountId = account;

    if (!finalAccountId) {
      throw new Error("accountId or account field is required");
    }

    // Step 2: Get party account details
    const partyAccount = await AccountMaster.findById(finalAccountId).session(
      activeSession
    );

    if (!partyAccount) {
      throw new Error("Party account not found");
    }

    // Step 3: Get transaction model
    const TransactionModel = getTransactionModel(transactionType);

    // Step 4: Prepare transaction data
    const preparedData = prepareTransactionData(transactionData, user);

    console.log("TransactionModel", TransactionModel);

    // Step 5: Create transaction record
    const newTransaction = new TransactionModel(preparedData);
    await newTransaction.save({ session: activeSession });

    // Step 6: Settle outstanding records using FIFO
    const settlementDetails = await settleOutstandingFIFO({
      accountId: finalAccountId,
      amount,
      type: transactionType.toLowerCase(),
      transactionId: newTransaction._id,
      transactionNumber: newTransaction.transactionNumber,
      transactionDate: newTransaction.transactionDate,
      company: transactionData.company,
      branch: transactionData.branch,
      createdBy: user._id,
      session: activeSession,
    });

    // Step 7: Update transaction with settlement details
    newTransaction.settlementDetails = settlementDetails;
    await newTransaction.save({ session: activeSession });

    // Step 8: Get Cash/Bank account
    const cashBankAccount = await getCashBankAccountForPayment({
      paymentMode: transactionData.paymentMode || "cash",
      companyId: transactionData.company,
      branchId: transactionData.branch,
      session: activeSession,
    });

    // Step 9: Create Cash/Bank ledger entry
    const ledgerEntry = await createCashBankLedgerEntry({
      transactionId: newTransaction._id,
      transactionType: transactionType.toLowerCase(),
      transactionNumber: newTransaction.transactionNumber,
      transactionDate: newTransaction.transactionDate,
      accountId: finalAccountId,
      accountName: partyAccount.accountName,
      amount: amount,
      paymentMode: transactionData.paymentMode || "cash",
      cashBankAccountId: cashBankAccount.accountId,
      cashBankAccountName: cashBankAccount.accountName,
      isCash: cashBankAccount.isCash,
      chequeNumber: transactionData.chequeNumber,
      chequeDate: transactionData.chequeDate,
      narration: transactionData.narration,
      company: transactionData.company,
      branch: transactionData.branch,
      createdBy: user._id,
      session: activeSession,
    });

    // Step 10: Create party account ledger
    const partyLedgerSide =
      transactionType.toLowerCase() === "receipt" ? "credit" : "debit";

    const partyLedger = await createAccountLedger(
      {
        company: transactionData.company,
        branch: transactionData.branch,
        account: finalAccountId,
        accountName: partyAccount.accountName,
        transactionId: newTransaction._id,
        transactionNumber: newTransaction.transactionNumber,
        transactionDate: newTransaction.transactionDate,
        transactionType: transactionType.toLowerCase(),
        ledgerSide: partyLedgerSide,
        amount: amount,
        narration:
          transactionData.narration || `${transactionType} transaction`,
        createdBy: user._id,
      },
      activeSession
    );

    // Step 11: Update monthly balance
    const monthlyBalance = await updateAccountMonthlyBalance(
      {
        company: transactionData.company,
        branch: transactionData.branch,
        account: finalAccountId,
        accountName: partyAccount.accountName,
        transactionDate: newTransaction.transactionDate,
        ledgerSide: partyLedgerSide,
        amount: amount,
      },
      activeSession
    );

    console.log("shouldManageSession", shouldManageSession);

    // Commit transaction if we manage the session
    if (shouldManageSession) {
      await activeSession.commitTransaction();
    }

    return {
      transaction: newTransaction,
      settlementsCount: settlementDetails.length,
      totalSettled: settlementDetails.reduce(
        (sum, s) => sum + s.settledAmount,
        0
      ),
      cashBankEntry: {
        id: ledgerEntry._id,
        accountUsed: cashBankAccount.accountName,
        entryType: ledgerEntry.entryType,
        amount: ledgerEntry.amount,
      },
      partyLedger: {
        id: partyLedger._id,
        side: partyLedgerSide,
        runningBalance: partyLedger.runningBalance,
      },
      monthlyBalance: {
        month: monthlyBalance.month,
        year: monthlyBalance.year,
        closingBalance: monthlyBalance.closingBalance,
      },
    };
  } catch (error) {
    if (shouldManageSession) {
      await activeSession.abortTransaction();
    }
    throw error;
  } finally {
    if (shouldManageSession) {
      activeSession.endSession();
    }
  }
};

/**
 * Main service function to edit a receipt/payment
 * Handles all database operations in a transaction
 */
export const editFundTransaction = async ({
  transactionId,
  transactionType,
  updateData,
  user,
}) => {
  console.log("\n🔄 ===== STARTING FUND TRANSACTION EDIT =====");
  console.log("Transaction ID:", transactionId);
  console.log("Transaction Type:", transactionType);
  console.log("Update Data:", updateData);

  // Start database session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ========================================
    // STEP 1: FETCH ORIGINAL TRANSACTION
    // ========================================
    console.log("\n📋 STEP 1: Fetching original transaction...");
    const TransactionModel = getTransactionModel(transactionType);
    const originalTx = await TransactionModel.findById(transactionId).session(
      session
    );

    if (!originalTx) {
      throw new Error("Transaction not found");
    }

    console.log("✅ Original transaction found:", {
      number: originalTx.transactionNumber,
      amount: originalTx.amount,
      account: originalTx.account,
    });

    // ========================================
    // STEP 2: VALIDATE EDIT REQUEST
    // ========================================
    console.log("\n🔍 STEP 2: Validating edit request...");
    await validateEditRequest(originalTx, updateData, transactionType, session);
    console.log("✅ Validation passed");

    // ========================================
    // STEP 3: CALCULATE DELTAS
    // ========================================
    console.log("\n📊 STEP 3: Calculating deltas...");
    const deltas = calculateFundTransactionDeltas(originalTx, updateData);
    console.log("Deltas:", deltas);

    // ========================================
    // STEP 4: DELETE OUTSTANDING SETTLEMENTS (✅ UPDATED)
    // ========================================
    console.log("\n🔄 STEP 4: Deleting outstanding settlements...");
    const deletedSettlements = await deleteOutstandingSettlements({
      transactionId: originalTx._id,
      transactionType,
      transactionNumber: originalTx.transactionNumber,
      accountId: originalTx.account,
      amount: originalTx.amount,
      session,
    });
    console.log(`✅ Deleted ${deletedSettlements.length} settlement(s)`);

    // ========================================
    // STEP 5: DELETE CASH/BANK LEDGER
    // ========================================
    console.log("\n💰 STEP 5: Deleting cash/bank ledger entry...");
    const deletedCashBankEntry = await deleteCashBankLedger({
      transactionId: originalTx._id,
      transactionType,
      session,
    });
    console.log("✅ Cash/Bank ledger entry deleted:", deletedCashBankEntry._id);

    // ========================================
    // STEP 6: UPDATE TRANSACTION RECORD
    // ========================================
    console.log("\n📝 STEP 6: Updating transaction record...");

    // Update only allowed fields
    if (updateData.amount !== undefined) {
      originalTx.amount = updateData.amount;
    }
    if (updateData.paymentMode !== undefined) {
      originalTx.paymentMode = updateData.paymentMode;
    }
    if (updateData.chequeNumber !== undefined) {
      originalTx.chequeNumber = updateData.chequeNumber;
    }
    if (updateData.chequeDate !== undefined) {
      originalTx.chequeDate = updateData.chequeDate;
    }
    if (updateData.narration !== undefined) {
      originalTx.narration = updateData.narration;
    }
    if (updateData.description !== undefined) {
      originalTx.description = updateData.description;
    }

    if (updateData.closingBalanceAmount !== undefined) {
      originalTx.closingBalanceAmount = updateData.closingBalanceAmount;
    }

    // Clear old settlement details (will be repopulated)
    originalTx.settlementDetails = [];

    await originalTx.save({ session });
    console.log("✅ Transaction record updated", originalTx);

    // ========================================
    // STEP 7: GET PARTY ACCOUNT DETAILS
    // ========================================
    const partyAccount = await AccountMaster.findById(
      originalTx.account
    ).session(session);

    if (!partyAccount) {
      throw new Error("Party account not found");
    }

    // ========================================
    // STEP 8: RE-RUN FIFO SETTLEMENT
    // ========================================
    console.log("\n🎯 STEP 8: Re-running FIFO settlement with new amount...");
    const newSettlements = await settleOutstandingFIFO({
      accountId: originalTx.account,
      amount: originalTx.amount,
      type: transactionType,
      transactionId: originalTx._id,
      transactionNumber: originalTx.transactionNumber,
      transactionDate: originalTx.transactionDate,
      company: originalTx.company,
      branch: originalTx.branch,
      createdBy: user._id,
      session,
    });

    // Update transaction with new settlement details
    originalTx.settlementDetails = newSettlements;
    await originalTx.save({ session });

    console.log(`✅ Created ${newSettlements.length} new settlement(s)`);
    console.log(" New settlements:", newSettlements);

    // ========================================
    // STEP 9: GET CASH/BANK ACCOUNT
    // ========================================
    console.log("\n🏦 STEP 9: Getting cash/bank account...");
    const cashBankAccount = await getCashBankAccountForPayment({
      paymentMode: originalTx.paymentMode || "cash",
      companyId: originalTx.company,
      branchId: originalTx.branch,
      session,
    });
    console.log("✅ Cash/Bank account:", cashBankAccount.accountName);

    // ========================================
    // STEP 10: CREATE NEW CASH/BANK LEDGER ENTRY
    // ========================================
    console.log("\n💰 STEP 10: Creating new cash/bank ledger entry...");
    const newCashBankEntry = await createCashBankLedgerEntry({
      transactionId: originalTx._id,
      transactionType,
      transactionNumber: originalTx.transactionNumber,
      transactionDate: originalTx.transactionDate,
      accountId: originalTx.account,
      accountName: partyAccount.accountName,
      amount: originalTx.amount,
      paymentMode: originalTx.paymentMode || "cash",
      cashBankAccountId: cashBankAccount.accountId,
      cashBankAccountName: cashBankAccount.accountName,
      isCash: cashBankAccount.isCash,
      chequeNumber: originalTx.chequeNumber,
      chequeDate: originalTx.chequeDate,
      narration: originalTx.narration,
      company: originalTx.company,
      branch: originalTx.branch,
      createdBy: user._id,
      session,
    });
    console.log("✅ New cash/bank ledger entry created:", newCashBankEntry);

    // ========================================
    // STEP 11: MARK MONTHLY BALANCE AS DIRTY
    // ========================================
    console.log("\n📅 STEP 11: Marking monthly balance as dirty...");
    const dirtyTaggingResult = await markMonthlyBalanceDirtyForFundTransaction({
      accountId: originalTx.account,
      transactionDate: originalTx.transactionDate,
      company: originalTx.company,
      branch: originalTx.branch,
      session,
    });
    console.log(
      "✅ Monthly balance marked for recalculation",
      dirtyTaggingResult
    );

    // ========================================
    // STEP 12: CREATE ADJUSTMENT ENTRY
    // ========================================
    console.log("\n📋 STEP 12: Creating adjustment entry...");
    const adjustmentEntry = await createFundTransactionAdjustmentEntry({
      originalTransaction: originalTx,
      transactionType,
      deltas,
      deletedSettlements, // ✅ UPDATED: Changed from reversedSettlements
      newSettlements,
      deletedCashBankEntry,
      newCashBankEntry,
      cashBankAccount,
      editedBy: user._id,
      session,
    });
    console.log("✅ Adjustment entry created:", adjustmentEntry);
    // ========================================
    // COMMIT TRANSACTION
    // ========================================
    await session.commitTransaction();
    console.log("\n✅ ===== TRANSACTION EDIT COMPLETED SUCCESSFULLY =====\n");

    return {
      transaction: originalTx,
      adjustmentEntry: {
        id: adjustmentEntry._id,
        adjustmentNumber: adjustmentEntry.adjustmentNumber,
        amountDelta: adjustmentEntry.amountDelta,
      },
      settlements: {
        reversed: deletedSettlements.length,
        created: newSettlements.length,
        totalSettled: newSettlements.reduce(
          (sum, s) => sum + s.settledAmount,
          0
        ),
      },
      cashBankUpdate: {
        reversedEntry: deletedCashBankEntry._id,
        newEntry: newCashBankEntry._id,
        accountUsed: cashBankAccount.accountName,
      },
    };
  } catch (error) {
    // Rollback transaction on error
    await session.abortTransaction();
    console.error("\n❌ Edit failed, transaction rolled back:", error.message);
    throw error;
  } finally {
    session.endSession();
  }
};


// ========================================
// HELPER: Decides what to do with receipt
// ========================================
export const handleReceiptOnEdit = async (originalTransaction, updatedData, userId, session) => {
  const oldPaidAmount = originalTransaction.paidAmount || 0;
  const newPaidAmount = updatedData.paidAmount || 0;

  const receiptType =
    originalTransaction.transactionType === "sale" ||
    originalTransaction.transactionType === "sales_return"
      ? "receipt"
      : "payment";

  const transactionTypeToModelName = {
    sale: "Sale",
    purchase: "Purchase",
    sales_return: "SalesReturn",
    purchase_return: "PurchaseReturn",
  };

  // Find existing receipt
  const Receipt = getTransactionModel(receiptType);
  const existingReceipt = await Receipt.findOne({
    reference: originalTransaction._id,
    referenceModel: transactionTypeToModelName[originalTransaction.transactionType] || "Sale",
  }).session(session);

  // ========================================
  // SCENARIO 1: Edit existing receipt
  // ========================================
  if (existingReceipt && newPaidAmount > 0) {
    console.log("🔄 Editing receipt...");

    const { previousBalanceAmount, netAmount } = updatedData;
    const totalAmount = netAmount + (previousBalanceAmount || 0);
    const closingBalance = totalAmount - newPaidAmount;

    const editResult = await editFundTransaction({
      transactionId: existingReceipt._id,
      transactionType: receiptType,
      updateData: {
        amount: newPaidAmount,
        previousBalanceAmount: totalAmount,
        closingBalanceAmount: closingBalance,
        paymentMode: updatedData.paymentMode || existingReceipt.paymentMode,
      },
      user: { _id: userId },
    });

    return {
      action: "edited",
      receiptNumber: editResult.transaction.transactionNumber,
      oldAmount: oldPaidAmount,
      newAmount: newPaidAmount,
    };
  }

  // ========================================
  // SCENARIO 2: Delete receipt
  // ========================================
  if (existingReceipt && newPaidAmount === 0) {
    console.log("🗑️ Deleting receipt...");

    const deleteResult = await deleteFundTransaction({
      transactionId: existingReceipt._id,
      transactionType: receiptType,
      user: { _id: userId },
      session,
      reason: `Payment removed from transaction ${originalTransaction.transactionNumber}`,
    });

    return {
      action: "deleted",
      receiptNumber: deleteResult.deletedTransaction.transactionNumber,
      deletedAmount: oldPaidAmount,
    };
  }

  // ========================================
  // SCENARIO 3: Create new receipt
  // ========================================
  if (!existingReceipt && newPaidAmount > 0) {
    console.log("✨ Creating receipt...");

    const { previousBalanceAmount, netAmount } = updatedData;
    const totalAmount = netAmount + (previousBalanceAmount || 0);
    const closingBalance = totalAmount - newPaidAmount;

    const createResult = await createFundTransaction(
      {
        transactionType: receiptType,
        account: updatedData.account || originalTransaction.account,
        accountName: updatedData.accountName || originalTransaction.accountName,
        amount: newPaidAmount,
        previousBalanceAmount: totalAmount,
        closingBalanceAmount: closingBalance,
        company: originalTransaction.company,
        branch: originalTransaction.branch,
        paymentMode: updatedData.paymentMode || "cash",
        reference: originalTransaction._id,
        referenceModel: transactionTypeToModelName[originalTransaction.transactionType] || "Sale",
        referenceType: originalTransaction.transactionType,
        date: updatedData.date || originalTransaction.date || new Date(),
        user: { _id: userId },
      },
      session
    );

    return {
      action: "created",
      receiptNumber: createResult.transaction.transactionNumber,
      amount: newPaidAmount,
    };
  }

  // ========================================
  // SCENARIO 4: No action needed
  // ========================================
  return {
    action: "none",
    message: "No receipt changes",
  };
};


// ========================================
// DELETE (NEW - add this)
// ========================================
export const deleteFundTransaction = async ({
  transactionId,
  transactionType,
  user,
  session,
  reason = "Receipt removed during transaction edit",
}) => {
  console.log("\n🗑️ ===== DELETING FUND TRANSACTION =====");

  try {
    const TransactionModel = getTransactionModel(transactionType);
    const originalTx = await TransactionModel.findById(transactionId).session(session);

    if (!originalTx) {
      throw new Error("Transaction not found");
    }

    // Reverse settlements
    const deletedSettlements = await deleteOutstandingSettlements({
      transactionId: originalTx._id,
      transactionType,
      transactionNumber: originalTx.transactionNumber,
      accountId: originalTx.account,
      amount: originalTx.amount,
      session,
    });

    // Delete cash/bank entry
    const deletedCashBankEntry = await deleteCashBankLedger({
      transactionId: originalTx._id,
      transactionType,
      session,
    });

    // Mark monthly balance dirty
    await markMonthlyBalanceDirtyForFundTransaction({
      accountId: originalTx.account,
      transactionDate: originalTx.transactionDate,
      company: originalTx.company,
      branch: originalTx.branch,
      session,
    });

    // Create adjustment entry
    const adjustmentEntry = await createFundTransactionDeletionAdjustmentEntry({
      originalTransaction: originalTx,
      transactionType,
      deletedSettlements,
      deletedCashBankEntry,
      deletedBy: user._id,
      reason,
      session,
    });

    // Delete receipt document
    await originalTx.deleteOne({ session });

    console.log("✅ Transaction deleted successfully");

    return {
      success: true,
      deletedTransaction: {
        id: originalTx._id,
        transactionNumber: originalTx.transactionNumber,
        amount: originalTx.amount,
      },
      adjustmentEntry: {
        id: adjustmentEntry._id,
      },
      settlements: {
        reversed: deletedSettlements.length,
      },
    };
  } catch (error) {
    console.error("❌ Deletion failed:", error.message);
    throw error;
  }
};

