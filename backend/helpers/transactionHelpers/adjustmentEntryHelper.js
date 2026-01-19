
import AdjustmentEntry from "../../model/AdjustmentEntryModel.js";
import { determineTransactionBehavior } from "./modelFindHelper.js";
import { transactionTypeToModelName } from "./transactionMappers.js";
import mongoose from "mongoose";
/**
 * Create adjustment entries with proper tracking
 */
// When a user edits a transaction, instead of deleting the original ledger entries and creating new ones (reversal approach), this function creates adjustment entries that show only the net difference between old and new values.
// Original Sale: ₹10,000
// Edited to: ₹12,000
// Instead of: "Delete ₹10,000, Add ₹12,000" ❌
// You do: "Add adjustment of +₹2,000"

/**
 * Create adjustment entries with proper tracking
 */
export const createAdjustmentEntries = async (
  original,
  updated,
  deltas,
  userId,
  session
) => {
  // Sale/Purchase Return: Dr (debit side) - Customer owes you
  // Purchase/Sales Return: Cr (credit side) - You owe supplier
  const behavior = determineTransactionBehavior(updated.transactionType);

  console.log("behavior", behavior);

  // ========================================
  // 1. Generate Adjustment Number
  // ========================================
  const adjustmentNumber = await AdjustmentEntry.generateAdjustmentNumber(
    updated.company,
    updated.branch,
    session
  );

  // ========================================
  // 2. Determine Adjustment Type
  // ========================================
  let adjustmentType = "amount_change";
  if (deltas.accountChanged && deltas.itemsChanged) {
    adjustmentType = "mixed";
  } else if (deltas.accountChanged) {
    adjustmentType = "account_change";
  } else if (deltas.itemsChanged) {
    adjustmentType = "item_change";
  }

  // ========================================
  // 3. Create Adjustment Entry Record (Metadata Only)
  // ========================================
  const adjustmentEntry = await AdjustmentEntry.create(
    [
      {
        company: updated.company,
        branch: updated.branch,
        originalTransaction: original._id,
        originalTransactionModel: transactionTypeToModelName(
          original.transactionType
        ),
        originalTransactionNumber: original.transactionNumber,
        originalTransactionDate: original.transactionDate,
        adjustmentNumber,
        adjustmentDate: new Date(),
        adjustmentType,
        affectedAccount: updated.account,
        affectedAccountName: updated.accountName,
        oldAccount: deltas.accountChanged ? deltas.oldAccount : null,
        oldAccountName: deltas.accountChanged ? deltas.oldAccountName : null,
        newAccount: deltas.accountChanged ? updated.account : null,
        newAccountName: deltas.accountChanged ? updated.accountName : null,

        // Store deltas only
        amountDelta: deltas.netAmountDelta,
        oldAmount: original.netAmount,
        newAmount: updated.netAmount,

        // Store item deltas
        // Store item deltas with rate included
        itemAdjustments: deltas.stockDelta.map((delta) => {
          let oldQuantity, newQuantity, oldRate, newRate;

          if (delta.isNew) {
            oldQuantity = 0;
            newQuantity = Math.abs(delta.quantityDelta);
            oldRate = 0;
            newRate = delta.newRate;
          } else if (delta.isRemoved) {
            oldQuantity = Math.abs(delta.quantityDelta);
            newQuantity = 0;
            oldRate = delta.oldRate;
            newRate = 0;
          } else {
            const originalItem = original.items.find(
              (item) => item.item.toString() === delta.item.toString()
            );
            oldQuantity = originalItem ? originalItem.quantity : 0;
            newQuantity = oldQuantity + delta.quantityDelta;
            oldRate = originalItem ? originalItem.rate : 0;
            newRate = delta.newRate;
          }

          // Determine type for clarity in adjustment entry
          let adjustmentType;
          if (delta.isNew) {
            adjustmentType = "added";
          } else if (delta.isRemoved) {
            adjustmentType = "removed";
          } else if (delta.quantityDelta !== 0 && delta.rateDelta !== 0) {
            adjustmentType = "quantity_and_rate_changed";
          } else if (delta.quantityDelta !== 0) {
            adjustmentType = "quantity_changed";
          } else if (delta.rateDelta !== 0) {
            adjustmentType = "rate_changed";
          } else {
            adjustmentType = "unchanged";
          }

          return {
            item: delta.item,
            itemName: delta.itemName,
            itemCode: delta.itemCode,
            adjustmentType,
            oldQuantity,
            newQuantity,
            quantityDelta: delta.quantityDelta,
            oldRate,
            newRate,
            rateDelta:
              typeof delta.rateDelta !== "undefined"
                ? delta.rateDelta
                : newRate - oldRate,
          };
        }),

        reason: updated.editReason || "Transaction edited",
        notes: updated.editNotes || null,
        editedBy: userId,
        status: "active",
        isSystemGenerated: true,
      },
    ],
    { session }
  );

  console.log("✅ Adjustment created:", {
    adjustmentNumber,
    adjustmentType,
    note: "No ledger entries created - will be recalculated by nightly job",
  });

  return {
    adjustmentEntry: adjustmentEntry[0],
    message: "Adjustment stored. Ledger will be recalculated in nightly job.",
  };
};

/**
 * Create cash/bank ledger adjustment for cash transactions
 */
export const createCashAccountAdjustment = async (
  original,
  updated,
  deltas,
  userId,
  session
) => {
  if (deltas.netAmountDelta === 0) {
    return null;
  }

  const cashBankAccount = await getCashBankAccountForPayment({
    paymentMode: "cash",
    companyId: updated.company,
    branchId: updated.branch,
    session,
  });

  const behavior = determineTransactionBehavior(updated.transactionType);

  // Determine entry type for adjustment
  let entryType;
  if (deltas.netAmountDelta > 0) {
    // Amount increased
    entryType = behavior.ledgerSide === "debit" ? "debit" : "credit";
  } else {
    // Amount decreased
    entryType = behavior.ledgerSide === "debit" ? "credit" : "debit";
  }

  const adjustmentEntry = await createCashBankLedgerEntry({
    transactionId: original._id,
    transactionType: updated.transactionType.toLowerCase(),
    transactionNumber: `ADJ-${updated.transactionNumber}`,
    transactionDate: new Date(),
    accountId: updated.account,
    accountName: updated.accountName,
    amount: Math.abs(deltas.netAmountDelta),
    paymentMode: "cash",
    cashBankAccountId: cashBankAccount.accountId,
    cashBankAccountName: cashBankAccount.accountName,
    isCash: cashBankAccount.isCash,
    company: updated.company,
    branch: updated.branch,
    entryType,
    narration: `Cash adjustment for edit - ${original.transactionNumber} (${
      deltas.netAmountDelta > 0 ? "increased" : "decreased"
    } by ₹${Math.abs(deltas.netAmountDelta)})`,
    createdBy: userId,
    session,
  });

  return adjustmentEntry;
};

// services/adjustmentService.js

export const createFundTransactionAdjustmentEntry = async ({
  originalTransaction,
  transactionType,
  deltas,
  deletedSettlements,
  newSettlements,
  deletedCashBankEntry, // ✅ UPDATED: Changed from reversedCashBankEntry
  newCashBankEntry,
  cashBankAccount,
  editedBy,
  session,
}) => {
  console.log("\n📋 ===== CREATING ADJUSTMENT ENTRY =====");

  const adjustmentNumber = await AdjustmentEntry.generateAdjustmentNumber(
    originalTransaction.company,
    originalTransaction.branch,
    session
  );

  // Determine adjustment type
  let adjustmentType = "amount_change";
  if (
    deltas.paymentModeChanged ||
    deltas.chequeDetailsChanged ||
    deltas.narrationChanged
  ) {
    adjustmentType = deltas.amountChanged ? "mixed" : "amount_change";
  }

  // Prepare settlements summary
  const settlementsSummary = {
    oldSettlementsCount: deletedSettlements.length,
    newSettlementsCount: newSettlements.length,
    outstandingsReversed: deletedSettlements.map((s) => s.outstandingNumber),
    outstandingsSettled: newSettlements.map((s) => s.outstandingNumber),
  };

  // ✅ UPDATED: Track deleted entry instead of reversed
  const cashBankImpact = {
    accountId: cashBankAccount.accountId,
    accountName: cashBankAccount.accountName,
    reversedLedgerEntry: deletedCashBankEntry._id, // Field name stays same for schema compatibility
    newLedgerEntry: newCashBankEntry._id,
  };

  // Build reason text
  let reason = "Transaction edited";
  if (deltas.amountChanged) {
    reason += ` - Amount changed from ₹${deltas.oldAmount} to ₹${deltas.newAmount}`;
  }
  if (deltas.paymentModeChanged) {
    reason += " - Payment mode changed";
  }

  const adjustmentEntry = new AdjustmentEntry({
    company: originalTransaction.company,
    branch: originalTransaction.branch,
    originalTransaction: originalTransaction._id,
    originalTransactionModel:
      transactionType.charAt(0).toUpperCase() + transactionType.slice(1),
    originalTransactionNumber: originalTransaction.transactionNumber,
    originalTransactionDate: originalTransaction.transactionDate,
    adjustmentNumber,
    adjustmentDate: new Date(),
    adjustmentType,
    affectedAccount: originalTransaction.account,
    affectedAccountName: originalTransaction.accountName,
    amountDelta: deltas.amountDelta,
    oldAmount: deltas.oldAmount,
    newAmount: deltas.newAmount,
    cashBankImpact,
    settlementsSummary,
    reason,
    notes: `Old cash/bank entry deleted and new entry created`,
    editedBy,
    status: "active",
    isSystemGenerated: true,
  });

  await adjustmentEntry.save({ session });

  console.log("✅ Adjustment entry created successfully");

  return adjustmentEntry;
};


/**
 * Create adjustment entry for fund transaction deletion
 * Records what was deleted for audit trail
 */
export const createFundTransactionDeletionAdjustmentEntry = async ({
  originalTransaction,
  transactionType,
  deletedSettlements,
  deletedCashBankEntry,
  deletedBy,
  reason,
  session,
}) => {
  console.log("\n📋 Creating deletion adjustment entry...");

  const AdjustmentEntry = mongoose.model("AdjustmentEntry");

  // Generate adjustment number
  const adjustmentNumber = await AdjustmentEntry.generateAdjustmentNumber(
    originalTransaction.company,
    originalTransaction.branch,
    session
  );

  // Map transaction type to model name
  const modelNameMap = {
    receipt: "Receipt",
    payment: "Payment",
    sale: "Sale",
    purchase: "Purchase",
    sales_return: "SalesReturn",
    purchase_return: "PurchaseReturn",
  };

  const adjustmentEntry = new AdjustmentEntry({
    // ========================================
    // REFERENCE FIELDS
    // ========================================
    company: originalTransaction.company,
    branch: originalTransaction.branch,

    // ========================================
    // ORIGINAL TRANSACTION REFERENCE
    // ========================================
    originalTransaction: originalTransaction._id,
    originalTransactionModel: modelNameMap[transactionType] || "Receipt",
    originalTransactionNumber: originalTransaction.transactionNumber,
    originalTransactionDate: originalTransaction.transactionDate || new Date(),

    // ========================================
    // ADJUSTMENT METADATA
    // ========================================
    adjustmentNumber: adjustmentNumber,
    adjustmentDate: new Date(),
    adjustmentType: "amount_change", // Deletion is essentially amount going to 0

    // ========================================
    // AFFECTED ENTITIES
    // ========================================
    affectedAccount: originalTransaction.account,
    affectedAccountName: originalTransaction.accountName,

    // ========================================
    // ADJUSTMENT DETAILS (Amount going to 0)
    // ========================================
    amountDelta: -originalTransaction.amount, // Negative because deletion
    oldAmount: originalTransaction.amount,
    newAmount: 0, // After deletion

    // ========================================
    // CASH/BANK IMPACT (Receipt/Payment)
    // ========================================
    cashBankImpact: {
      accountId: deletedCashBankEntry.cashBankAccount,
      accountName: deletedCashBankEntry.cashBankAccountName,
      reversedLedgerEntry: deletedCashBankEntry._id,
      newLedgerEntry: null, // No new entry (deleted)
    },

    // ========================================
    // SETTLEMENT SUMMARY (Receipt/Payment)
    // ========================================
    settlementsSummary: {
      oldSettlementsCount: deletedSettlements.length,
      newSettlementsCount: 0, // All reversed, none created
      outstandingsReversed: deletedSettlements.map(
        (s) => s.outstandingNumber || s.transactionNumber || "Unknown"
      ),
      outstandingsSettled: [], // Empty after deletion
    },

    // ========================================
    // AUDIT & REASON
    // ========================================
    reason: reason,
    notes: `Receipt/Payment deleted - ${reason}`,
    editedBy: deletedBy,

    // ========================================
    // STATUS & FLAGS
    // ========================================
    status: "active",
    isSystemGenerated: true,
    isReversed: false,
  });

  await adjustmentEntry.save({ session });

  console.log("✅ Deletion adjustment entry created:", {
    adjustmentNumber: adjustmentEntry.adjustmentNumber,
    amountReversed: originalTransaction.amount,
    settlementsReversed: deletedSettlements.length,
  });

  return adjustmentEntry;
};


