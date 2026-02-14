// const AccountLedger = require('../models/AccountLedger');
// const ItemLedger = require('../models/ItemLedger');
import AccountLedger from "../../model/AccountLedgerModel.js";
import ItemLedger from "../../model/ItemsLedgerModel.js";

/**
 * Create account ledger entry
 */
export const createAccountLedger = async (data, session) => {
  try {
    const {
      company,
      branch,
      account,
      accountName,
      transactionId,
      transactionNumber,
      transactionDate,
      transactionType,
      ledgerSide, // "debit" or "credit"
      
      amount,
      narration,
      createdBy,
    } = data;

    console.log("call came herr");
    

    // Get last running balance for this account
    const lastBalance = await AccountLedger.getLastBalance(
      account,
      company,
      branch,
      session
    );

    // console.log("last Balance",lastBalance);
    // console.log("ledgerSide",ledgerSide);
    

    // Calculate new running balance
    let runningBalance;
    if (ledgerSide === "debit") {
      runningBalance = lastBalance + amount;
    } else if (ledgerSide === "credit") {
      runningBalance = lastBalance - amount;
    } else {
      throw new Error(`Invalid ledger side: ${ledgerSide}`);
    }

    // console.log("runningBalance",runningBalance);
    

    // Create ledger entry
    const ledgerEntry = await AccountLedger.create(
      [
        {
          company,
          branch,
          account,
          accountName,
          transactionId,
          transactionNumber,
          transactionDate,
          transactionType,
          ledgerSide,
          amount,
          runningBalance,
          narration: narration || `${transactionType} transaction`,
          createdBy,
        },
      ],
      { session }
    );


    console.log('leger entry ',ledgerEntry);
    

    return ledgerEntry[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Create item ledger entries for all items in transaction
 */
export const createItemLedgers = async (data, session) => {
  try {
    const {
      company,
      branch,
      items,
      transactionId,
      transactionNumber,
      transactionDate,
      transactionType,
      movementType, // "in" or "out"
      account,
      accountName,
      createdBy,
    } = data;

    const ledgerEntries = [];

    for (const item of items) {
      // Get last running stock balance for this item
      const lastStockBalance = await ItemLedger.getLastStockBalance(
        item.item,
        company,
        branch,
        session
      );

      // Calculate new running stock balance
      let runningStockBalance;
      if (movementType === "in") {
        runningStockBalance = lastStockBalance + item.quantity;
      } else if (movementType === "out") {
        runningStockBalance = lastStockBalance - item.quantity;
      } else {
        throw new Error(`Invalid movement type: ${movementType}`);
      }

      // Create item ledger entry
      const ledgerEntry = {
        company,
        branch,
        item: item.item,
        itemName: item.itemName,
        itemCode: item.itemCode,
        unit: item.unit,
        transactionId,
        transactionNumber,
        transactionDate,
        transactionType,
        movementType,
        quantity: item.quantity,
        rate: item.rate,
        baseAmount: item.baseAmount,
        amountAfterTax: item.amountAfterTax,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        runningStockBalance,
        account,
        accountName,
        createdBy,
      };

      ledgerEntries.push(ledgerEntry);
    }

    // Bulk create all item ledger entries with ordered: true
    const createdEntries = await ItemLedger.create(ledgerEntries, {
      session,
      ordered: true, // ← Add this option : With session: Mongoose requires explicit ordering to ensure transaction consistency
    });

    return createdEntries;
  } catch (error) {
    throw error;
  }
};
