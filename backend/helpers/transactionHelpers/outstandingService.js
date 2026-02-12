import { calculateDueDate } from "../../../shared/utils/date.js";
import CashBankLedgerModel from "../../model/CashBankLedgerModel.js";
import Outstanding from "../../model/OutstandingModel.js";
import { getCashBankAccountForPayment } from "../CommonTransactionHelper/CashBankAccountHelper.js";
import { createCashBankLedgerEntry } from "../CommonTransactionHelper/CashBankLedgerHelper.js";
import { determineTransactionBehavior } from "./modelFindHelper.js";
import { transactionTypeToModelName } from "./transactionMappers.js";
import OutstandingSettlement from "../../model/OutstandingSettlementModel.js";

/**
 * Create outstanding record
 */
export const createOutstanding = async (data, session) => {
  try {
    const {
      company,
      branch,
      account,
      accountName,
      accountType,
      transactionModel,
      sourceTransaction,
      transactionType,
      transactionNumber,
      transactionDate,
      outstandingType, // "dr" or "cr"
      totalAmount,
      paidAmount,
      closingBalanceAmount,
      paymentTermDays = 30,
      notes,
      createdBy,
    } = data;

    // Only create outstanding if there's a balance
    if (closingBalanceAmount <= 0) {
      return null;
    }

    // Calculate due date
    const dueDate = calculateDueDate(transactionDate, paymentTermDays);

    // Determine initial status
    let status = "pending";
    if (paidAmount > 0 && closingBalanceAmount > 0) {
      status = "partial";
    }

    // Create outstanding record
    const outstanding = await Outstanding.create(
      [
        {
          company,
          branch,
          account,
          accountName,
          accountType,
          transactionModel,
          sourceTransaction,
          transactionType,
          transactionNumber,
          transactionDate,
          outstandingType,
          totalAmount,
          paidAmount,
          closingBalanceAmount,
          dueDate,
          status,
          notes,
          createdBy,
        },
      ],
      { session },
    );

    return outstanding[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Update outstanding when payment is received
 */
export const updateOutstandingPayment = async (
  outstandingId,
  paidAmount,
  userId,
  session,
) => {
  try {
    const outstanding =
      await Outstanding.findById(outstandingId).session(session);

    if (!outstanding) {
      throw new Error("Outstanding record not found");
    }

    // Use instance method to update payment
    outstanding.updatePayment(paidAmount, userId);

    await outstanding.save({ session });

    return outstanding;
  } catch (error) {
    throw error;
  }
};

/**
 * Update outstanding on edit
 * CRITICAL: Retains the original outstanding _id
 */
export const updateOutstandingOnEdit = async (
  original,
  updated,
  deltas,
  userId,
  session,
) => {
  // Find existing outstanding by original transaction ID
  const existingOutstanding = await Outstanding.findOne({
    sourceTransaction: original._id,
  }).session(session);

  if (!existingOutstanding) {
    // No existing outstanding - might be cash transaction
    // Or outstanding was already settled and closed
    console.log("No outstanding found for this transaction");
    return null;
  }

  // ========================================
  // Recalculate Outstanding Balance
  // ========================================
  const behavior = determineTransactionBehavior(updated.transactionType);

  // Get all settlements for this outstanding
  const appliedReceipts = existingOutstanding.appliedReceipts || 0;
  const appliedPayments = existingOutstanding.appliedPayments || 0;

  // Calculate closingBalanceAmount based on voucher type
  let closingBalanceAmount;

  if (behavior.outstandingType === "dr") {
    // For Sale and Purchase Return (Dr vouchers)
    closingBalanceAmount =
      updated.netAmount - appliedReceipts + appliedPayments;
  } else {
    // For Purchase and Sales Return (Cr vouchers)
    closingBalanceAmount = -(
      updated.netAmount -
      appliedPayments +
      appliedReceipts
    );
  }

  // ========================================
  // Update Outstanding (RETAIN _id)
  // ========================================
  existingOutstanding.totalAmount = updated.netAmount;
  existingOutstanding.closingBalanceAmount = closingBalanceAmount;
  existingOutstanding.transactionNumber = updated.transactionNumber;
  existingOutstanding.transactionDate = updated.transactionDate;
  existingOutstanding.accountName = updated.accountName;

  // Handle account change
  if (deltas.accountChanged) {
    existingOutstanding.account = updated.account;
  }

  existingOutstanding.lastUpdatedBy = userId;
  existingOutstanding.lastUpdatedAt = new Date();

  // Update status
  if (closingBalanceAmount <= 0) {
    existingOutstanding.status = "settled";
  } else if (appliedReceipts > 0 || appliedPayments > 0) {
    existingOutstanding.status = "partial";
  } else {
    existingOutstanding.status = "pending";
  }

  console.log("Updated Outstanding:", existingOutstanding);

  await existingOutstanding.save({ session });

  return existingOutstanding;
};

// // helpers/outstandingAccountTypeChangeHelper.js

// import Outstanding from "../models/OutstandingModel.js";
// import OutstandingSettlement from "../models/OutstandingSettlementModel.js";
// import CashBankLedgerModel from "../models/CashBankLedgerModel.js";
// import { getCashBankAccountForPayment } from "./cashBankHelper.js";
// import { createCashBankLedgerEntry } from "./cashBankLedgerService.js";
// import { transactionTypeToModelName, determineTransactionBehavior } from "./transactionBehavior.js";

/**
 * HANDLE ACCOUNT TYPE CHANGE ON EDIT
 *
 * This helper is responsible for keeping Outstanding + Advances + Cash/Bank
 * correct when a transaction's ACCOUNT TYPE changes during edit.
 *
 * It covers:
 *
 * 1) Customer/Supplier → Cash
 *    - If NO settlements:
 *        a) Delete existing outstanding (invoice/bill)
 *        b) Create cash/bank ledger for edited transaction
 *    - If HAS settlements:
 *        a) Convert settlements to advances (per settlement)
 *        b) Mark settlements as reversed
 *        c) Delete original outstanding
 *        d) Create cash/bank ledger for edited transaction
 *
 * 2) Cash → Customer/Supplier
 *    - a) Delete existing cash/bank ledger
 *    - b) Create NEW Outstanding for party with full netAmount
 *
 * 3) Customer/Supplier → SAME TYPE, Account CHANGED (Binu → Sony)
 *    - If NO settlements:
 *        a) Delete old outstanding
 *        b) Create new outstanding for new party with full netAmount
 *    - If HAS settlements:
 *        a) Convert settlements to advances for OLD party
 *        b) Mark settlements as reversed
 *        c) Delete old outstanding
 *        d) Create new outstanding for NEW party with full netAmount
 *
 * 3b) Customer/Supplier → SAME ACCOUNT (only amount/date changed)
 *    - a) Do NOT delete outstanding
 *    - b) Update:
 *         - totalAmount = updated.netAmount
 *         - closingBalanceAmount using:
 *              For Sale & Debit Note (Dr):
 *                closing = totalAmount – Receipts + Payments
 *              For Purchase & Credit Note (Cr):
 *                closing = –(totalAmount – Payments + Receipts)
 *         - If closing < 0:
 *              outstandingType = "cr"
 *              closingBalanceAmount stays NEGATIVE
 *
 * 5) Cash → Cash
 *    - Keep existing logic:
 *      - If account changed: delete old cash/bank ledger + create new
 *      - Else: update amount only
 */

export const handleAccountTypeChangeOnEdit = async (
  original, // original transaction doc
  updated, // edited data
  deltas, // result from calculateTransactionDeltas
  userId,
  session,
) => {
  const behavior = determineTransactionBehavior(updated.transactionType);

  const originalAccountType = original.accountType;
  const newAccountType = updated.accountType;

  // ========================================
  // ✅ Skip outstanding update if paid amount exists
  // The receipt handler will manage outstanding via settlements
  // ========================================
  const hasPaidAmount =
    (original.paidAmount || 0) > 0 || (updated.paidAmount || 0) > 0;

  console.log("hasPaidAmount:", hasPaidAmount);

  if (
    hasPaidAmount &&
    original.account.toString() === updated.account.toString()
  ) {
    console.log(
      "⏭️ Skipping outstanding update - receipt handler will manage it",
    );
    return {
      outstandingDeleted: false,
      outstandingCreated: false,
      cashBankDeleted: false,
      cashBankCreated: false,
      note: "Outstanding managed by receipt handler",
    };
  }

  console.log(
    `Account type transition: ${originalAccountType} → ${newAccountType}`,
  );

  const result = {
    outstandingDeleted: false,
    outstandingCreated: false,
    cashBankDeleted: false,
    cashBankCreated: false,
    outstanding: null,
    cashBankLedger: null,
  };

  // =========================================================
  // CASE 1: Customer/Supplier → Cash
  // =========================================================
  if (
    (originalAccountType === "customer" ||
      originalAccountType === "supplier") &&
    newAccountType === "cash"
  ) {
    console.log("📝 Case 1: Customer/Supplier → Cash");

    const oldOutstanding = await Outstanding.findOne({
      sourceTransaction: original._id,
    }).session(session);

    if (!oldOutstanding) {
      console.log("⚠️ No outstanding found, just handle cash/bank ledger.");
      await handleCreateCashBankLedgerOnEdit(
        original,
        updated,
        behavior,
        userId,
        session,
        result,
      );
      return result;
    }

    const activeCount = await OutstandingSettlement.countDocuments({
      outstanding: oldOutstanding._id,
      settlementStatus: "active",
    }).session(session);

    if (activeCount === 0) {
      // No settlements: delete outstanding + create cash ledger
      const deleteResult = await Outstanding.deleteOne({
        _id: oldOutstanding._id,
      }).session(session);

      result.outstandingDeleted = deleteResult.deletedCount > 0;
      console.log(
        `🗑️ Deleted outstanding (no settlements): ${result.outstandingDeleted}`,
      );

      await handleCreateCashBankLedgerOnEdit(
        original,
        updated,
        behavior,
        userId,
        session,
        result,
      );

      return result;
    }

    // Has settlements: convert to advances + reverse + delete + cash ledger
    await convertSettlementsToAdvancesAndDeleteOutstanding({
      originalTransaction: original,
      oldOutstanding,
      reason: "Party → Cash edit: moved settlements to advances",
      userId,
      session,
    });

    await handleCreateCashBankLedgerOnEdit(
      original,
      updated,
      behavior,
      userId,
      session,
      result,
    );

    return result;
  }

  // =========================================================
  // CASE 2: Cash → Customer/Supplier
  // =========================================================
  if (
    originalAccountType === "cash" &&
    (newAccountType === "customer" || newAccountType === "supplier")
  ) {
    console.log("📝 Case 2: Cash → Customer/Supplier");

    // 1) Delete existing cash/bank ledger
    const deleteResult = await CashBankLedgerModel.deleteOne({
      transaction: original._id,
      transactionModel: transactionTypeToModelName(original.transactionType),
    }).session(session);

    result.cashBankDeleted = deleteResult.deletedCount > 0;
    console.log(
      `🗑️ Deleted cash/bank ledger for cash txn: ${result.cashBankDeleted}`,
    );

    // 2) Create new Outstanding for party
    const newOutstandingArr = await Outstanding.create(
      [
        {
          company: updated.company,
          branch: updated.branch,
          account: updated.account,
          accountName: updated.accountName,
          accountType: updated.accountType,
          transactionModel: transactionTypeToModelName(updated.transactionType),
          sourceTransaction: original._id,
          transactionType: updated.transactionType,
          transactionNumber: updated.transactionNumber,
          transactionDate: updated.transactionDate || original.transactionDate,
          dueDate: updated.transactionDate || original.transactionDate,
          outstandingType: behavior.outstandingType, // "dr" or "cr"
          totalAmount: updated.netAmount,
          paidAmount: 0,
          closingBalanceAmount:
            behavior.outstandingType === "dr"
              ? updated.netAmount
              : -updated.netAmount,
          paymentTermDays: 30,
          notes: updated.notes || "",
          createdBy: userId,
        },
      ],
      { session },
    );

    result.outstandingCreated = true;
    result.outstanding = newOutstandingArr[0];
    console.log(
      `✅ Created outstanding for party from cash: ${result.outstanding._id}`,
    );

    return result;
  }

  // =========================================================
  // CASE 3: Customer/Supplier → SAME TYPE, Account CHANGED
  // =========================================================
  if (
    (originalAccountType === "customer" && newAccountType === "customer") ||
    (originalAccountType === "supplier" && newAccountType === "supplier")
  ) {
    if (deltas.accountChanged) {
      console.log(
        "📝 Case 3: Customer/Supplier → Another Customer/Supplier (account changed)",
      );

      const oldOutstanding = await Outstanding.findOne({
        sourceTransaction: original._id,
      }).session(session);

      if (!oldOutstanding) {
        console.log(
          "⚠️ No outstanding found for original transaction, nothing to migrate.",
        );
        return result;
      }

      const activeCount = await OutstandingSettlement.countDocuments({
        outstanding: oldOutstanding._id,
        settlementStatus: "active",
        transactionType: { $ne: "offset" },
      }).session(session);

      if (activeCount === 0) {
        // 3.1 No settlements: delete old + create new
        const deleteResult = await Outstanding.deleteOne({
          _id: oldOutstanding._id,
        }).session(session);

        result.outstandingDeleted = deleteResult.deletedCount > 0;
        console.log(
          `🗑️ Deleted old outstanding (no settlements): ${result.outstandingDeleted}`,
        );

        const newOutstandingArr = await Outstanding.create(
          [
            {
              company: updated.company,
              branch: updated.branch,
              account: updated.account,
              accountName: updated.accountName,
              accountType: updated.accountType,
              transactionModel: transactionTypeToModelName(
                updated.transactionType,
              ),
              sourceTransaction: original._id,
              transactionType: updated.transactionType,
              transactionNumber: updated.transactionNumber,
              transactionDate:
                updated.transactionDate || original.transactionDate,
              dueDate: updated.transactionDate || original.transactionDate,
              outstandingType: behavior.outstandingType,
              totalAmount: updated.netAmount,
              paidAmount: 0,
              closingBalanceAmount:
                behavior.outstandingType === "dr"
                  ? updated.netAmount
                  : -updated.netAmount,
              paymentTermDays: 30,
              notes: updated.notes || "",
              createdBy: userId,
            },
          ],
          { session },
        );

        result.outstandingCreated = true;
        result.outstanding = newOutstandingArr[0];
        console.log(
          `✅ Created new outstanding for new party (no settlements): ${result.outstanding._id}`,
        );

        return result;
      }

      // 3.2 Has settlements: move to advances + new outstanding for new party
      await convertSettlementsToAdvancesAndDeleteOutstanding({
        originalTransaction: original,
        oldOutstanding,
        reason: "Party change: moved settlements to advances",
        userId,
        session,
      });

      const newOutstandingArr = await Outstanding.create(
        [
          {
            company: updated.company,
            branch: updated.branch,
            account: updated.account,
            accountName: updated.accountName,
            accountType: updated.accountType,
            transactionModel: transactionTypeToModelName(
              updated.transactionType,
            ),
            sourceTransaction: original._id,
            transactionType: updated.transactionType,
            transactionNumber: updated.transactionNumber,
            transactionDate:
              updated.transactionDate || original.transactionDate,
            dueDate: updated.transactionDate || original.transactionDate,
            outstandingType: behavior.outstandingType,
            totalAmount: updated.netAmount,
            paidAmount: 0,
            closingBalanceAmount:
              behavior.outstandingType === "dr"
                ? updated.netAmount
                : -updated.netAmount,
            paymentTermDays: 30,
            notes: updated.notes || "",
            createdBy: userId,
          },
        ],
        { session },
      );

      result.outstandingCreated = true;
      result.outstanding = newOutstandingArr[0];
      console.log(
        `✅ Created new outstanding for new party (with previous settlements moved to advance): ${result.outstanding._id}`,
      );

      return result;
    } else {
      // Same party, just amount/date/etc changed → update existing outstanding
      console.log("📝 Case 3b: Same party, update outstanding totals only");

      const existingOutstanding = await Outstanding.findOne({
        sourceTransaction: original._id,
      }).session(session);

      if (!existingOutstanding) {
        console.log("⚠️ No outstanding found to update.");
        return result;
      }

      existingOutstanding.totalAmount = updated.netAmount;

      const { totalReceipts, totalPayments } =
        await calculateReceiptPaymentTotals(existingOutstanding._id, session);

      let closingBalance;
      if (behavior.outstandingType === "dr") {
        // Sale / Debit Note / Purchase Return
        closingBalance = updated.netAmount - totalReceipts + totalPayments;
      } else {
        // Purchase / Credit Note / Sales Return
        closingBalance = -(updated.netAmount - totalPayments + totalReceipts);
      }

      console.log("Calculated closing balance:", closingBalance);

      existingOutstanding.closingBalanceAmount = closingBalance;

      if (closingBalance < 0) {
        existingOutstanding.outstandingType = "cr";
      } else {
        existingOutstanding.outstandingType = "dr";
      }

      await existingOutstanding.save({ session });
      result.outstanding = existingOutstanding;
      console.log(
        `✅ Updated existing outstanding totals (same party): ${existingOutstanding._id}`,
      );

      return result;
    }
  }

  // =========================================================
  // CASE 4: Cash → Cash
  // =========================================================
  if (originalAccountType === "cash" && newAccountType === "cash") {
    // If cash account itself changed → delete old cash/bank ledger and create new one
    if (deltas.accountChanged) {
      console.log("📝 Case 4: Cash → Another Cash Account");

      // 1) Delete old cash/bank ledger
      const deleteResult = await CashBankLedgerModel.deleteOne({
        transaction: original._id,
        transactionModel: transactionTypeToModelName(original.transactionType),
      }).session(session);

      result.cashBankDeleted = deleteResult.deletedCount > 0;
      console.log(`🗑️ Deleted old cash/bank ledger: ${result.cashBankDeleted}`);

      // 2) Create new cash/bank ledger for updated cash account
      const cashBankAccount = await getCashBankAccountForPayment({
        paymentMode: "cash",
        companyId: updated.company,
        branchId: updated.branch,
        session,
      });

      const ledger = await createCashBankLedgerEntry({
        transactionId: original._id,
        transactionType: updated.transactionType.toLowerCase(),
        transactionNumber: updated.transactionNumber,
        transactionDate: updated.transactionDate || original.transactionDate,
        accountId: updated.account,
        accountName: updated.accountName,
        amount: updated.netAmount,
        paymentMode: "cash",
        cashBankAccountId: cashBankAccount.accountId,
        cashBankAccountName: cashBankAccount.accountName,
        isCash: cashBankAccount.isCash,
        company: updated.company,
        branch: updated.branch,
        entryType: behavior.ledgerSide,
        narration: `${updated.transactionType} - ${updated.transactionNumber} (Edited to different cash account)`,
        createdBy: userId,
        session,
      });

      result.cashBankLedger = ledger;
      result.cashBankCreated = true;
      console.log(`✅ Created new cash/bank ledger: ${ledger._id}`);
    } else {
      // Same cash account, only amount/date changed → update existing ledger
      console.log("📝 Case 4b: Same Cash Account, updating ledger");

      if (deltas.netAmountDelta !== 0) {
        const existingEntry = await CashBankLedgerModel.findOne({
          transaction: original._id,
          transactionModel: transactionTypeToModelName(
            original.transactionType,
          ),
        }).session(session);

        if (existingEntry) {
          existingEntry.amount = updated.netAmount;
          existingEntry.transactionDate =
            updated.transactionDate || existingEntry.transactionDate;
          existingEntry.updatedAt = new Date();
          await existingEntry.save({ session });

          result.cashBankLedger = existingEntry;
          console.log("✅ Updated cash/bank ledger amount/date");
        } else {
          console.log("⚠️ No existing cash/bank ledger found to update.");
        }
      }
    }

    return result;
  }

  return result;
};

/**
 * Convert settlements on an existing outstanding into ADVANCE outstandings,
 * then reverse settlements and delete the original outstanding.
 *
 * While creating advance:
 *  - If original transactionType is "sale" or "purchase_return"
 *      → transactionType: "advance_receipt", outstandingType: "cr"
 *  - Else ("purchase" or "sales_return")
 *      → transactionType: "advance_payment", outstandingType: "dr"
 */
export const convertSettlementsToAdvancesAndDeleteOutstanding = async ({
  originalTransaction,
  oldOutstanding,
  reason = "Converted to advances",
  userId,
  session,
}) => {
  const settlements = await OutstandingSettlement.find({
    outstanding: oldOutstanding._id,
    settlementStatus: "active",
    transactionType: { $ne: "offset" },
  }).session(session);

  if (!settlements.length) {
    console.log(
      `ℹ️ No active settlements found for outstanding ${oldOutstanding._id}, deleting only.`,
    );
    const deleteResult = await Outstanding.deleteOne({
      _id: oldOutstanding._id,
    }).session(session);

    return {
      createdAdvanceCount: 0,
      reversedSettlementCount: 0,
      outstandingDeleted: deleteResult.deletedCount > 0,
    };
  }

  console.log(
    `🔄 Converting ${settlements.length} settlements on outstanding ${oldOutstanding._id} to advances...`,
  );

  const originalType = originalTransaction.transactionType;
  const isAdvanceReceiptSource =
    originalType === "sale" || originalType === "purchase_return";

  const advanceDocs = settlements.map((s) => {
    const base = {
      company: oldOutstanding.company,
      branch: oldOutstanding.branch,
      account: oldOutstanding.account,
      accountName: oldOutstanding.accountName,
      accountType: oldOutstanding.accountType,
      transactionModel: transactionTypeToModelName(
        originalTransaction.transactionType,
      ),
      sourceTransaction: s.transaction, // receipt/payment _id
      transactionNumber: s.transactionNumber,
      transactionDate: new Date(),
      dueDate: new Date(),
      totalAmount: s.settledAmount,
      paidAmount: 0,
      closingBalanceAmount: s.settledAmount,
      paymentTermDays: 0,
      notes: "Auto-created advance from settlement",
      createdBy: userId,
    };

    if (isAdvanceReceiptSource) {
      return {
        ...base,
        transactionType: "advance_receipt",
        outstandingType: "cr",
      };
    } else {
      return {
        ...base,
        transactionType: "advance_payment",
        outstandingType: "dr",
      };
    }
  });

  const createdAdvances = await Outstanding.insertMany(advanceDocs, {
    session,
  });

  console.log(
    `✅ Created ${createdAdvances.length} advance outstandings for party ${oldOutstanding.accountName}`,
  );

  const settlementUpdateResult = await OutstandingSettlement.updateMany(
    {
      outstanding: oldOutstanding._id,
      settlementStatus: "active",
    },
    {
      settlementStatus: "reversed",
      reversedAt: new Date(),
      reversedBy: userId,
      reversalReason: reason,
    },
    { session },
  );

  console.log(
    `✅ Reversed ${settlementUpdateResult.modifiedCount} settlements for outstanding ${oldOutstanding._id}`,
  );

  const deleteResult = await Outstanding.deleteOne({
    _id: oldOutstanding._id,
  }).session(session);

  console.log(
    `🗑️ Deleted original outstanding ${oldOutstanding._id}: ${
      deleteResult.deletedCount > 0
    }`,
  );

  return {
    createdAdvanceCount: createdAdvances.length,
    reversedSettlementCount: settlementUpdateResult.modifiedCount,
    outstandingDeleted: deleteResult.deletedCount > 0,
  };
};

/**
 * Helper: Create cash/bank ledger entry for edited transaction.
 */
const handleCreateCashBankLedgerOnEdit = async (
  original,
  updated,
  behavior,
  userId,
  session,
  result,
) => {
  const cashBankAccount = await getCashBankAccountForPayment({
    paymentMode: "cash",
    companyId: updated.company,
    branchId: updated.branch,
    session,
  });

  const ledger = await createCashBankLedgerEntry({
    transactionId: original._id,
    transactionType: updated.transactionType.toLowerCase(),
    transactionNumber: updated.transactionNumber,
    transactionDate: updated.transactionDate || original.transactionDate,
    accountId: updated.account,
    accountName: updated.accountName,
    amount: updated.netAmount,
    paymentMode: "cash",
    cashBankAccountId: cashBankAccount.accountId,
    cashBankAccountName: cashBankAccount.accountName,
    isCash: cashBankAccount.isCash,
    company: updated.company,
    branch: updated.branch,
    entryType: behavior.ledgerSide,
    narration: `${updated.transactionType} - ${updated.transactionNumber} (Edited to cash)`,
    createdBy: userId,
    session,
  });

  result.cashBankLedger = ledger;
  result.cashBankCreated = true;
  console.log(`✅ Created cash/bank ledger: ${ledger._id}`);
};

/**
 * Helper: Calculate total Receipts and Payments for an outstanding
 * from active settlements.
 */
export const calculateReceiptPaymentTotals = async (outstandingId, session) => {
  const settlements = await OutstandingSettlement.find({
    outstanding: outstandingId,
    settlementStatus: "active",
  }).session(session);

  let totalReceipts = 0;
  let totalPayments = 0;

  for (const s of settlements) {
    if (s.transactionType === "receipt") {
      totalReceipts += s.settledAmount;
    } else if (s.transactionType === "payment") {
      totalPayments += s.settledAmount;
    }
  }

  return { totalReceipts, totalPayments };
};
