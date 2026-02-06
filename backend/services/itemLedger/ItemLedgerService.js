// services/ItemLedgerService.js
import mongoose from "mongoose";
import ItemLedger from "../../model/ItemsLedgerModel.js";
import ItemMonthlyBalance from "../../model/ItemMonthlyBalanceModel.js";
import AdjustmentEntry from "../../model/AdjustmentEntryModel.js";
import ItemMasterModel from "../../model/masters/ItemMasterModel.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/* =========================================================================
   🎯 STOCK MOVEMENT HELPER
   ========================================================================= */

/**
 * Get stock movement conditions for aggregation
 *
 * When transactionType is NOT specified, use natural stock movement:
 * - INWARD: purchase, sales_return
 * - OUTWARD: sale, purchase_return
 *
 * @param {string|null} transactionType - 'sale', 'purchase', or null
 * @returns {Object} Aggregation conditions for in/out calculations
 */
const getStockMovementConditions = (transactionType) => {
  if (transactionType === "sale") {
    // Sale filter: sale = OUT, sales_return = IN
    return {
      inCondition: { $eq: ["$transactionType", "sales_return"] },
      outCondition: { $eq: ["$transactionType", "sale"] },
    };
  } else if (transactionType === "purchase") {
    // Purchase filter: purchase = IN, purchase_return = OUT
    return {
      inCondition: { $eq: ["$transactionType", "purchase"] },
      outCondition: { $eq: ["$transactionType", "purchase_return"] },
    };
  } else {
    // Stock register (default): purchase + sales_return = IN, sale + purchase_return = OUT
    // stock_adjustment with movement "in" = IN, movement "out" = OUT
    return {
      inCondition: {
        $or: [
          { $in: ["$transactionType", ["purchase", "sales_return"]] },
          {
            $and: [
              { $eq: ["$transactionType", "stock_adjustment"] },
              { $eq: ["$movementType", "in"] },
            ],
          },
        ],
      },
      outCondition: {
        $or: [
          { $in: ["$transactionType", ["sale", "purchase_return"]] },
          {
            $and: [
              { $eq: ["$transactionType", "stock_adjustment"] },
              { $eq: ["$movementType", "out"] },
            ],
          },
        ],
      },
    };
  }
};

/* =========================================================================
   📋 CORE UTILITY FUNCTIONS
   ========================================================================= */

/**
 * Calculate opening balances for multiple items at once (BATCHED)
 *
 * Process:
 * 1. Find last clean monthly balance for each item
 * 2. If no monthly balance, use item master opening stock
 * 3. Calculate movements in "dirty period" (after last clean snapshot, before report start)
 * 4. Apply adjustments in dirty period
 * 5. Return map of itemId -> opening quantity
 *
 * @param {string} company - Company ID
 * @param {string} branch - Branch ID
 * @param {string[]} itemIds - Array of item IDs
 * @param {Date} selectedDate - Report start date (opening calculated for this date)
 * @returns {Object} Map of { itemId: openingQuantity }
 */
/**
 * Calculate opening balances for multiple items at once (BATCHED)
 * Now checks backward for clean periods dynamically instead of hard-coded base date
 */
export const getBatchOpeningBalances = async (
  company,
  branch,
  itemIds,
  selectedDate
) => {
  console.log("=== getBatchOpeningBalances START ===");
  console.log("Input params:", {
    company,
    branch,
    itemIdsCount: itemIds.length,
    selectedDate,
    selectedDateISO: selectedDate?.toISOString(),
  });

  const companyId = toObjectId(company);
  const branchId = toObjectId(branch);
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  // Handle invalid dates
  if (!selectedDate || isNaN(selectedDate.getTime())) {
    console.log("Early return: Invalid date detected");
    return itemIds.reduce((acc, id) => ({ ...acc, [id.toString()]: 0 }), {});
  }

  // Calculate previous month (for finding last clean monthly balance)
  const prevMonthDate = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() - 1,
    1
  );
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth() + 1;

  console.log("Calculated previous month:", { prevYear, prevMonthNum });

  /* -----------------------------------------------------------------------
     STEP 1: Get last CLEAN monthly balance for ALL items (look backward infinitely)
     This finds the most recent verified snapshot before our report date
     ----------------------------------------------------------------------- */
  console.time("Step 1: Monthly balances query");
  const monthlyBalances = await ItemMonthlyBalance.aggregate([
    {
      $match: {
        company: companyId,
        branch: branchId,
        item: { $in: itemIdObjs },
        needsRecalculation: false, // Only clean/verified balances
        $or: [
          { year: { $lt: prevYear } },
          { year: prevYear, month: { $lte: prevMonthNum } },
        ],
      },
    },
    {
      $sort: { item: 1, year: -1, month: -1 }, // Latest first per item
    },
    {
      $group: {
        _id: "$item",
        closingStock: { $first: "$closingStock" }, // Take latest
        year: { $first: "$year" },
        month: { $first: "$month" },
      },
    },
  ]);
  console.timeEnd("Step 1: Monthly balances query");
  console.log("Monthly balances found:", monthlyBalances.length);

  /* -----------------------------------------------------------------------
     STEP 2: For items without clean monthly balance, check if transactions exist
     ----------------------------------------------------------------------- */
  const itemsWithBalances = monthlyBalances.map((m) => m._id.toString());
  const itemsNeedingFallback = itemIdObjs.filter(
    (id) => !itemsWithBalances.includes(id.toString())
  );

  console.log("Items needing fallback logic:", itemsNeedingFallback.length);

  const baseBalances = {};
  const dirtyPeriodStarts = {};

  // Add monthly balances to base
  monthlyBalances.forEach((mb) => {
    const itemKey = mb._id.toString();
    baseBalances[itemKey] = mb.closingStock || 0;
    dirtyPeriodStarts[itemKey] = new Date(mb.year, mb.month, 1);
    console.log(
      `Item ${itemKey}: Monthly balance ${mb.closingStock} from ${mb.year}-${mb.month}`
    );
  });

  // STEP 3: For remaining items, check if they have ANY transactions
  let itemsWithTransactions = [];
  if (itemsNeedingFallback.length > 0) {
    console.time("Step 2a: Check transaction existence");
    itemsWithTransactions = await ItemLedger.aggregate([
      {
        $match: {
          company: companyId,
          branch: branchId,
          item: { $in: itemsNeedingFallback },
          transactionDate: { $lt: selectedDate },
        },
      },
      {
        $group: {
          _id: "$item",
          earliestTransaction: { $min: "$transactionDate" },
          hasTransactions: { $sum: 1 },
        },
      },
    ]);
    console.timeEnd("Step 2a: Check transaction existence");
    console.log("Items with transactions:", itemsWithTransactions.length);
  }

  const itemsWithTxnIds = itemsWithTransactions.map((i) => i._id.toString());

  // STEP 4: Fetch ItemMaster for ALL items needing fallback
  // (Not just those with transactions - opening stock is needed regardless)
  let masterBalances = [];
  if (itemsNeedingFallback.length > 0) {
    console.time("Step 2b: Item master query");
    masterBalances = await ItemMasterModel.aggregate([
      {
        $match: {
          _id: { $in: itemsNeedingFallback },
          company: companyId,
        },
      },
      { $unwind: "$stock" },
      {
        $match: {
          "stock.branch": branchId,
        },
      },
      {
        $project: {
          _id: 1,
          openingStock: "$stock.openingStock",
        },
      },
    ]);
    console.timeEnd("Step 2b: Item master query");
    console.log("Master balances found:", masterBalances.length);
  }

  // Add master balances
  masterBalances.forEach((master) => {
    const itemKey = master._id.toString();
    baseBalances[itemKey] = master.openingStock || 0;
    
    // Find earliest transaction date for this item (if exists)
    const txnInfo = itemsWithTransactions.find(
      (i) => i._id.toString() === itemKey
    );
    
    // If item has transactions, dirty period starts from earliest transaction
    // If no transactions, dirty period starts from selectedDate (so range is empty)
    dirtyPeriodStarts[itemKey] = txnInfo?.earliestTransaction || selectedDate;
    console.log(
      `Item ${itemKey}: Master opening ${master.openingStock}, dirty start ${dirtyPeriodStarts[itemKey]?.toISOString()}`
    );
  });

  // For items that don't exist in ItemMaster at all, default to 0
  itemsNeedingFallback.forEach((id) => {
    const itemKey = id.toString();
    if (baseBalances[itemKey] === undefined) {
      baseBalances[itemKey] = 0;
      dirtyPeriodStarts[itemKey] = selectedDate; // No dirty period
      console.log(`Item ${itemKey}: No data found, defaulting to 0`);
    }
  });

  console.log("Base balances initialized:", Object.keys(baseBalances).length);

  // Dirty period ends just before report starts
  const dirtyPeriodEnd = new Date(selectedDate);
  dirtyPeriodEnd.setHours(0, 0, 0, 0);

  console.log("Dirty period end:", dirtyPeriodEnd.toISOString());

  /* -----------------------------------------------------------------------
     STEP 5: Get ledger movements for dirty periods
     Each item has different dirty period based on last snapshot
     ----------------------------------------------------------------------- */
  console.time("Step 3: Ledger movements query");

  // Build $or conditions with per-item date ranges
  const ledgerMatchConditions = itemIdObjs
    .map((id) => {
      const itemKey = id.toString();
      const startDate = dirtyPeriodStarts[itemKey];

      // Skip if no dirty period (e.g., no transactions exist)
      if (!startDate || startDate >= dirtyPeriodEnd) {
        return null;
      }

      return {
        item: id,
        transactionDate: {
          $gte: startDate, // Dirty period start (different per item)
          $lt: dirtyPeriodEnd, // Report start date (same for all)
        },
      };
    })
    .filter(Boolean); // Remove null entries

  let ledgerMovements = [];
  if (ledgerMatchConditions.length > 0) {
    ledgerMovements = await ItemLedger.aggregate([
      {
        $match: {
          company: companyId,
          branch: branchId,
          $or: ledgerMatchConditions, // Use per-item date ranges
        },
      },
      {
        $addFields: {
          // Convert to signed quantity: in = +, out = -
          signedQuantity: {
            $multiply: [
              "$quantity",
              { $cond: [{ $eq: ["$movementType", "out"] }, -1, 1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$item",
          totalSignedQuantity: { $sum: "$signedQuantity" },
          transactionCount: { $sum: 1 },
        },
      },
    ]);
  }
  console.timeEnd("Step 3: Ledger movements query");
  console.log("Ledger movements found:", ledgerMovements.length);
  ledgerMovements.forEach((lm) => {
    console.log(
      `  Item ${lm._id}: ${lm.transactionCount} transactions, total signed qty: ${lm.totalSignedQuantity}`
    );
  });

  /* -----------------------------------------------------------------------
     STEP 6: Get adjustments (all adjustments before selectedDate)
     Adjustments modify original transactions, need to apply deltas
     ----------------------------------------------------------------------- */
  console.time("Step 4: Adjustment movements query");

  const adjustmentMatchConditions = itemIdObjs.map((id) => ({
    "itemAdjustments.item": id,
    originalTransactionDate: {
      $lt: selectedDate,
    },
  }));

  const adjustmentMovements = await AdjustmentEntry.aggregate([
    {
      $match: {
        company: companyId,
        branch: branchId,
        status: "active",
        isReversed: false,
      },
    },
    { $unwind: "$itemAdjustments" },
    {
      $match: {
        $or: adjustmentMatchConditions,
      },
    },
    {
      $addFields: {
        // Calculate signed delta based on transaction type
        signedQuantityDelta: {
          $multiply: [
            "$itemAdjustments.quantityDelta",
            {
              $switch: {
                branches: [
                  {
                    case: {
                      $in: [
                        "$originalTransactionModel",
                        ["Sale", "PurchaseReturn"],
                      ],
                    },
                    then: -1, // Sales reduce stock
                  },
                  {
                    case: {
                      $in: [
                        "$originalTransactionModel",
                        ["Purchase", "SalesReturn"],
                      ],
                    },
                    then: 1, // Purchases increase stock
                  },
                ],
                default: 1,
              },
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$itemAdjustments.item",
        totalSignedQtyDelta: { $sum: "$signedQuantityDelta" },
      },
    },
  ]);
  console.timeEnd("Step 4: Adjustment movements query");
  console.log("Adjustment movements found:", adjustmentMovements.length);
  adjustmentMovements.forEach((am) => {
    console.log(`  Item ${am._id}: adjustment delta ${am.totalSignedQtyDelta}`);
  });

  /* -----------------------------------------------------------------------
     STEP 7: Combine all data to calculate final opening balances
     Formula: opening = base + ledgerMovements + adjustments
     ----------------------------------------------------------------------- */
  console.log("Step 5: Combining all data");
  const finalBalances = {};

  itemIdObjs.forEach((id) => {
    const itemKey = id.toString();
    let balance = baseBalances[itemKey] || 0;
    const baseBalance = balance;

    // Add ledger movements
    const ledgerMove = ledgerMovements.find(
      (m) => m._id.toString() === itemKey
    );
    let ledgerMovement = 0;
    if (ledgerMove) {
      ledgerMovement = ledgerMove.totalSignedQuantity;
      balance += ledgerMovement;
    }

    // Add adjustment deltas
    const adjMove = adjustmentMovements.find(
      (m) => m._id.toString() === itemKey
    );
    let adjustmentMovement = 0;
    if (adjMove) {
      adjustmentMovement = adjMove.totalSignedQtyDelta;
      balance += adjustmentMovement;
    }

    finalBalances[itemKey] = balance;

    console.log(
      `Item ${itemKey} final: ${baseBalance} (base) + ${ledgerMovement} (ledger) + ${adjustmentMovement} (adj) = ${balance}`
    );
  });

  console.log("Final balances computed:", Object.keys(finalBalances).length);
  console.log("=== getBatchOpeningBalances END ===\n");

  return finalBalances;
};


/**
 * Get last purchase rate for multiple items at once (BATCHED)
 *
 * Process:
 * 1. Find most recent purchase transaction per item
 * 2. If no purchase found, fallback to item master opening rate
 * 3. Return map of itemId -> rate
 *
 * Used for calculating closing balance value (qty × rate)
 *
 * @param {ObjectId} companyId - Company ObjectId
 * @param {ObjectId} branchId - Branch ObjectId
 * @param {string[]} itemIds - Array of item ID strings
 * @param {Date} startDate - Search for purchases from this date
 * @param {Date} endDate - Search for purchases up to this date
 * @returns {Object} Map of { itemId: lastPurchaseRate }
 */
export const getBatchLastPurchaseRates = async (
  companyId,
  branchId,
  itemIds,
  startDate,
  endDate
) => {
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  // Step 1: Find last purchase transaction for each item
  const lastPurchases = await ItemLedger.aggregate([
    {
      $match: {
        company: companyId,
        branch: branchId,
        item: { $in: itemIdObjs },
        transactionType: { $in: ["purchase", "purchase_return"] },
        transactionDate: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $sort: { item: 1, transactionDate: -1, createdAt: -1 }, // Latest first
    },
    {
      $group: {
        _id: "$item",
        lastPurchaseRate: { $first: "$rate" }, // Take most recent rate
      },
    },
  ]);

  // Build map
  const ratesMap = {};
  lastPurchases.forEach((purchase) => {
    ratesMap[purchase._id.toString()] = purchase.lastPurchaseRate;
  });

  // Step 2: Fallback to item master for items without purchase history
  const itemsNeedingMasterRate = itemIdObjs.filter(
    (id) => !ratesMap[id.toString()]
  );

  if (itemsNeedingMasterRate.length > 0) {
    const masterRates = await ItemMasterModel.aggregate([
      {
        $match: {
          _id: { $in: itemsNeedingMasterRate },
          company: companyId,
        },
      },
      { $unwind: "$stock" },
      {
        $match: {
          "stock.branch": branchId,
        },
      },
      {
        $project: {
          _id: 1,
          openingRate: "$stock.openingRate",
        },
      },
    ]);

    masterRates.forEach((master) => {
      const itemKey = master._id.toString();
      ratesMap[itemKey] = master.openingRate || 0;
    });
  }

  // Ensure all items have a rate (default 0)
  itemIdObjs.forEach((id) => {
    const itemKey = id.toString();
    if (!ratesMap[itemKey]) {
      ratesMap[itemKey] = 0;
    }
  });

  return ratesMap;
};

/**
 * Get adjusted ledger data for multiple items with $lookup to adjustments (BATCHED)
 *
 * This is used in FULL REFOLD path when adjustments exist in report period
 *
 * Process:
 * 1. Fetch ledger entries for report period
 * 2. $lookup adjustment entries for each transaction
 * 3. Calculate effective quantities/amounts (original + adjustment deltas)
 * 4. Group by item and calculate summaries
 * 5. Return map of itemId -> ledger data
 *
 * @param {Object} params - Parameters object
 * @returns {Object} Map of { itemId: { openingQuantity, summary, transactions } }
 */
export const getBatchAdjustedLedgers = async ({
  companyId,
  branchId,
  itemIds,
  startDate,
  endDate,
  openingBalances,
  lastPurchaseRates,
  transactionType = null,
}) => {
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  const baseMatch = {
    company: companyId,
    branch: branchId,
    item: { $in: itemIdObjs },
    transactionDate: { $gte: startDate, $lte: endDate },
  };

  // Apply transaction type filter if specified
  if (transactionType === "sale") {
    baseMatch.transactionType = { $in: ["sale", "sales_return"] };
  } else if (transactionType === "purchase") {
    baseMatch.transactionType = { $in: ["purchase", "purchase_return"] };
  }

  // Get stock movement conditions based on transactionType
  const getMovementConditions = () => {
    if (transactionType === "sale") {
      return {
        inCondition: { $eq: ["$transactionType", "sales_return"] },
        outCondition: { $eq: ["$transactionType", "sale"] },
      };
    } else if (transactionType === "purchase") {
      return {
        inCondition: { $eq: ["$transactionType", "purchase"] },
        outCondition: { $eq: ["$transactionType", "purchase_return"] },
      };
    } else {
      // Stock register logic: purchase + sales_return = IN, sale + purchase_return = OUT
      // stock_adjustment with movement "in" = IN, movement "out" = OUT
      return {
        inCondition: {
          $or: [
            { $in: ["$transactionType", ["purchase", "sales_return"]] },
            {
              $and: [
                { $eq: ["$transactionType", "stock_adjustment"] },
                { $eq: ["$movementType", "in"] },
              ],
            },
          ],
        },
        outCondition: {
          $or: [
            { $in: ["$transactionType", ["sale", "purchase_return"]] },
            {
              $and: [
                { $eq: ["$transactionType", "stock_adjustment"] },
                { $eq: ["$movementType", "out"] },
              ],
            },
          ],
        },
      };
    }
  };

  const { inCondition, outCondition } = getMovementConditions();

  const ledgers = await ItemLedger.aggregate([
    { $match: baseMatch },

    /* -------------------------------------------------------------------
       $lookup: Join with adjustment_entries to get deltas
       This is expensive! Only used when adjustments exist
       ------------------------------------------------------------------- */
    {
      $lookup: {
        from: "adjustment_entries",
        let: {
          txnNum: "$transactionNumber",
          company: "$company",
          branch: "$branch",
          item: "$item",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$company", "$$company"] },
                  { $eq: ["$branch", "$$branch"] },
                  { $eq: ["$originalTransactionNumber", "$$txnNum"] },
                  { $eq: ["$status", "active"] },
                  { $eq: ["$isReversed", false] },
                  {
                    $in: [
                      "$originalTransactionModel",
                      ["Sale", "Purchase", "SalesReturn", "PurchaseReturn"],
                    ],
                  },
                ],
              },
            },
          },
          { $unwind: "$itemAdjustments" },
          {
            $match: {
              $expr: { $eq: ["$itemAdjustments.item", "$$item"] },
            },
          },
          {
            $group: {
              _id: null,
              totalQuantityDelta: { $sum: "$itemAdjustments.quantityDelta" },
              totalRateDelta: { $sum: "$itemAdjustments.rateDelta" },
              totalAmountDelta: { $sum: "$amountDelta" },
            },
          },
        ],
        as: "adjustments",
      },
    },

    /* -------------------------------------------------------------------
       Calculate effective values (original + adjustment deltas)
       ------------------------------------------------------------------- */
    {
      $addFields: {
        totalQuantityDelta: {
          $ifNull: [
            { $arrayElemAt: ["$adjustments.totalQuantityDelta", 0] },
            0,
          ],
        },
        totalRateDelta: {
          $ifNull: [{ $arrayElemAt: ["$adjustments.totalRateDelta", 0] }, 0],
        },
        totalAmountDelta: {
          $ifNull: [{ $arrayElemAt: ["$adjustments.totalAmountDelta", 0] }, 0],
        },

        // Effective quantity = original + delta
        effectiveQuantity: {
          $add: [
            "$quantity",
            {
              $ifNull: [
                { $arrayElemAt: ["$adjustments.totalQuantityDelta", 0] },
                0,
              ],
            },
          ],
        },

        // Effective rate = original + delta
        effectiveRate: {
          $add: [
            "$rate",
            {
              $ifNull: [
                { $arrayElemAt: ["$adjustments.totalRateDelta", 0] },
                0,
              ],
            },
          ],
        },

        effectiveBaseAmount: {
          $multiply: [
            {
              $add: [
                "$quantity",
                {
                  $ifNull: [
                    { $arrayElemAt: ["$adjustments.totalQuantityDelta", 0] },
                    0,
                  ],
                },
              ],
            },
            {
              $add: [
                "$rate",
                {
                  $ifNull: [
                    { $arrayElemAt: ["$adjustments.totalRateDelta", 0] },
                    0,
                  ],
                },
              ],
            },
          ],
        },

        // Effective amount = (effective qty × effective rate) + tax
        effectiveAmountAfterTax: {
          $add: [
            {
              $multiply: [
                {
                  $add: [
                    "$quantity",
                    {
                      $ifNull: [
                        {
                          $arrayElemAt: ["$adjustments.totalQuantityDelta", 0],
                        },
                        0,
                      ],
                    },
                  ],
                },
                {
                  $add: [
                    "$rate",
                    {
                      $ifNull: [
                        { $arrayElemAt: ["$adjustments.totalRateDelta", 0] },
                        0,
                      ],
                    },
                  ],
                },
              ],
            },
            "$taxAmount",
          ],
        },

        hasAdjustment: { $gt: [{ $size: "$adjustments" }, 0] },
      },
    },

    {
      $project: {
        adjustments: 0, // Remove adjustment array from output
        __v: 0,
      },
    },

    { $sort: { item: 1, transactionDate: 1, createdAt: 1, _id: 1 } },

    /* -------------------------------------------------------------------
       Group by item to calculate summaries
       ------------------------------------------------------------------- */
    {
      $group: {
        _id: "$item",
        transactions: { $push: "$$ROOT" }, // Keep all transactions
        totalIn: {
          $sum: {
            $cond: [inCondition, "$effectiveQuantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [outCondition, "$effectiveQuantity", 0],
          },
        },
        amountIn: {
          $sum: {
            $cond: [inCondition, "$effectiveAmountAfterTax", 0],
          },
        },
        amountOut: {
          $sum: {
            $cond: [outCondition, "$effectiveAmountAfterTax", 0],
          },
        },
        transactionCount: { $sum: 1 },
      },
    },
  ]);

  // Convert to map
  const ledgerMap = {};

  ledgers.forEach((item) => {
    const itemKey = item._id.toString();
    const openingQty = openingBalances[itemKey] || 0;
    const closingQty = openingQty + item.totalIn - item.totalOut;
    const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
    const closingValue = closingQty * lastPurchaseRate;

    ledgerMap[itemKey] = {
      openingQuantity: openingQty,
      summary: {
        totalIn: item.totalIn,
        totalOut: item.totalOut,
        amountIn: item.amountIn,
        amountOut: item.amountOut,
        closingQuantity: closingQty,
        lastPurchaseRate: lastPurchaseRate,
        closingBalance: closingValue,
        transactionCount: item.transactionCount,
      },
      transactions: item.transactions,
    };
  });

  // Handle items with no transactions in the period
  itemIds.forEach((id) => {
    const itemKey = id.toString();
    if (!ledgerMap[itemKey]) {
      const openingQty = openingBalances[itemKey] || 0;
      const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
      const closingValue = openingQty * lastPurchaseRate;

      ledgerMap[itemKey] = {
        openingQuantity: openingQty,
        summary: {
          totalIn: 0,
          totalOut: 0,
          amountIn: 0,
          amountOut: 0,
          closingQuantity: openingQty,
          lastPurchaseRate: lastPurchaseRate,
          closingBalance: closingValue,
          transactionCount: 0,
        },
        transactions: [],
      };
    }
  });

  return ledgerMap;
};

/* =========================================================================
   🎯 PATH DETECTION FUNCTION
   ========================================================================= */

/**
 * Check if dirty period exists and determine which report path to use
 *
 * Returns object with:
 * - isDirty: boolean (true if opening needs calculation)
 * - needsFullRefold: boolean (true if ledger needs $lookup adjustments)
 * - reason: string (explanation for debugging)
 *
 * Three possible outcomes:
 * 1. {isDirty: false, needsFullRefold: false} → FAST PATH
 * 2. {isDirty: true, needsFullRefold: false} → HYBRID PATH
 * 3. {isDirty: true, needsFullRefold: true} → FULL REFOLD
 *
 * @param {Object} params - Parameters object
 * @returns {Object} Status object
 */
export const checkIfDirtyPeriodExists = async ({
  company,
  branch,
  itemIds,
  startDate,
  endDate,
}) => {
  console.log("=== Checking dirty period status ===");

  const companyId = toObjectId(company);
  const branchId = toObjectId(branch);
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  const reportStartDate = new Date(startDate);

  // Calculate previous month details
  const prevMonthDate = new Date(
    reportStartDate.getFullYear(),
    reportStartDate.getMonth() - 1,
    1
  );
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth() + 1;

  console.log("Checking for clean monthly balances:", {
    prevYear,
    prevMonthNum,
  });

  /* -----------------------------------------------------------------------
     CHECK 1: Do ALL items have clean monthly balance for previous month?
     If not, we need full refold (missing base data)
     ----------------------------------------------------------------------- */
  const cleanMonthlyBalances = await ItemMonthlyBalance.countDocuments({
    company: companyId,
    branch: branchId,
    item: { $in: itemIdObjs },
    year: prevYear,
    month: prevMonthNum,
    needsRecalculation: false,
  });

  if (cleanMonthlyBalances !== itemIds.length) {
    console.log(
      `❌ Only ${cleanMonthlyBalances}/${itemIds.length} items have clean monthly balance`
    );
    return {
      isDirty: true,
      needsFullRefold: true,
      reason: "Missing or dirty monthly balances",
    };
  }

  console.log(`✅ All ${itemIds.length} items have clean monthly balance`);

  /* -----------------------------------------------------------------------
     CHECK 2: Are there adjustments in the REPORT period?
     If yes, we need full refold (must apply adjustment deltas)
     ----------------------------------------------------------------------- */
  const adjustmentsInPeriod = await AdjustmentEntry.countDocuments({
    company: companyId,
    branch: branchId,
    originalTransactionDate: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
    status: "active",
    isReversed: false,
  });

  if (adjustmentsInPeriod > 0) {
    console.log(`❌ Found ${adjustmentsInPeriod} adjustments in report period`);
    return {
      isDirty: true,
      needsFullRefold: true,
      reason: "Adjustments in report period",
    };
  }

  console.log("✅ No adjustments in report period");

  /* -----------------------------------------------------------------------
     CHECK 3: Does report start mid-month?
     If yes, use hybrid path (calculate opening, but simple ledger)
     ----------------------------------------------------------------------- */
  if (reportStartDate.getDate() !== 1) {
    console.log("⚠️  Report starts mid-month, opening needs calculation");
    return {
      isDirty: true,
      needsFullRefold: false,
      reason: "Mid-month start (hybrid path eligible)",
    };
  }

  /* -----------------------------------------------------------------------
     All checks passed: Pure fast path!
     ----------------------------------------------------------------------- */
  console.log("🚀 Pure fast path - everything is clean!");
  return {
    isDirty: false,
    needsFullRefold: false,
    reason: "All conditions perfect for fast path",
  };
};

/* =========================================================================
   🚀 PATH 1: FAST PATH (No dirty period, no adjustments)
   ========================================================================= */

/**
 * Get simple ledger report (FAST PATH)
 *
 * Used when:
 * - Report starts on 1st of month
 * - All items have clean monthly balance for previous month
 * - No adjustments in report period
 *
 * Process:
 * 1. Get opening directly from monthly balance (no calculation)
 * 2. Simple aggregation for ledger (NO $lookup to adjustments)
 * 3. Calculate summaries
 *
 * Performance: ~150-200ms for 15 items
 *
 * @param {Object} params - Parameters object
 * @returns {Object} Report data { items, pagination, filters }
 */
export const getSimpleLedgerReport = async ({
  company,
  branch,
  startDate,
  endDate,
  item = null,
  transactionType = null,
  page = 1,
  limit = 50,
  searchTerm = null,
}) => {
  console.log("=== getSimpleLedgerReport (FAST PATH) START ===");
  const reportStartTime = Date.now();

  const companyId = toObjectId(company);
  const branchId = toObjectId(branch);
  const itemFilter = item ? toObjectId(item) : null;

  const baseMatch = {
    company: companyId,
    branch: branchId,
    transactionDate: { $gte: startDate, $lte: endDate },
  };
  if (itemFilter) baseMatch.item = itemFilter;

  if (transactionType === "sale") {
    baseMatch.transactionType = { $in: ["sale", "sales_return"] };
  } else if (transactionType === "purchase") {
    baseMatch.transactionType = { $in: ["purchase", "purchase_return"] };
  }

  let searchStage = {};
  if (searchTerm) {
    const regex = new RegExp(searchTerm, "i");
    searchStage = {
      $or: [{ itemName: regex }, { itemCode: regex }],
    };
  }

  /* -----------------------------------------------------------------------
     QUERY 1: Get paginated item list
     ----------------------------------------------------------------------- */
  console.time("Query 1: Item list");
  const itemFacet = await ItemLedger.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: "$item",
        itemName: { $first: "$itemName" },
        itemCode: { $first: "$itemCode" },
        unit: { $first: "$unit" },
      },
    },
    ...(searchTerm ? [{ $match: searchStage }] : []),
    { $sort: { itemName: 1, itemCode: 1 } },
    {
      $facet: {
        meta: [{ $count: "totalItems" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ]);
  console.timeEnd("Query 1: Item list");

  const totalItems = itemFacet[0]?.meta[0]?.totalItems || 0;
  const itemsPage = itemFacet[0]?.data || [];

  if (itemsPage.length === 0) {
    console.log("No items found, returning empty result");
    return {
      items: [],
      pagination: {
        page,
        limit,
        totalItems: 0,
        totalPages: 0,
      },
      filters: {
        company,
        branch,
        startDate,
        endDate,
        transactionType: transactionType || "all",
        searchTerm: searchTerm || null,
      },
    };
  }

  const itemIds = itemsPage.map((row) => row._id.toString());
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  console.log(`Processing ${itemIds.length} items`);

  /* -----------------------------------------------------------------------
     QUERY 2: Get opening balances DIRECTLY from monthly balance
     No calculation needed! Just read closing stock from previous month
     ----------------------------------------------------------------------- */
  console.time("Query 2: Opening balances from monthly balance");
  const prevMonthDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() - 1,
    1
  );
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth() + 1;

  const monthlyBalances = await ItemMonthlyBalance.aggregate([
    {
      $match: {
        company: companyId,
        branch: branchId,
        item: { $in: itemIdObjs },
        year: prevYear,
        month: prevMonthNum,
        needsRecalculation: false,
      },
    },
    {
      $project: {
        _id: 0,
        item: "$item",
        closingStock: "$closingStock",
      },
    },
  ]);
  console.timeEnd("Query 2: Opening balances from monthly balance");

  // Build opening balances map
  const openingBalances = {};
  monthlyBalances.forEach((mb) => {
    openingBalances[mb.item.toString()] = mb.closingStock || 0;
  });

  // Ensure all items have opening balance
  itemIdObjs.forEach((id) => {
    const itemKey = id.toString();
    if (!openingBalances[itemKey]) {
      openingBalances[itemKey] = 0;
    }
  });

  console.log(
    `Opening balances loaded for ${Object.keys(openingBalances).length} items`
  );

  /* -----------------------------------------------------------------------
     QUERY 3: Get last purchase rates
     ----------------------------------------------------------------------- */
  console.time("Query 3: Last purchase rates");
  const lastPurchaseRates = await getBatchLastPurchaseRates(
    companyId,
    branchId,
    itemIds,
    startDate,
    endDate
  );
  console.timeEnd("Query 3: Last purchase rates");

  /* -----------------------------------------------------------------------
     QUERY 4: Simple ledger aggregation (NO $lookup!)
     This is the key difference - no adjustment lookups needed
     ----------------------------------------------------------------------- */
  console.time("Query 4: Simple ledger aggregation");

  // Get stock movement conditions based on transactionType
  const { inCondition, outCondition } =
    getStockMovementConditions(transactionType);

  const ledgers = await ItemLedger.aggregate([
    { $match: baseMatch },

    // NO $lookup here! That's what makes this fast

    { $sort: { item: 1, transactionDate: 1, createdAt: 1, _id: 1 } },

    // Group by item to calculate summaries
    {
      $group: {
        _id: "$item",
        transactions: { $push: "$$ROOT" },
        totalIn: {
          $sum: {
            $cond: [inCondition, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [outCondition, "$quantity", 0],
          },
        },
        amountIn: {
          $sum: {
            $cond: [
              inCondition,
              { $add: [{ $multiply: ["$quantity", "$rate"] }, "$taxAmount"] },
              0,
            ],
          },
        },
        amountOut: {
          $sum: {
            $cond: [
              outCondition,
              { $add: [{ $multiply: ["$quantity", "$rate"] }, "$taxAmount"] },
              0,
            ],
          },
        },
        transactionCount: { $sum: 1 },
      },
    },
  ]);
  console.timeEnd("Query 4: Simple ledger aggregation");

  console.log(`Ledger data processed for ${ledgers.length} items`);

  // Build ledger map
  const ledgerMap = {};

  ledgers.forEach((item) => {
    const itemKey = item._id.toString();
    const openingQty = openingBalances[itemKey] || 0;
    const closingQty = openingQty + item.totalIn - item.totalOut;
    const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
    const closingValue = closingQty * lastPurchaseRate;

    ledgerMap[itemKey] = {
      openingQuantity: openingQty,
      summary: {
        totalIn: item.totalIn,
        totalOut: item.totalOut,
        amountIn: item.amountIn,
        amountOut: item.amountOut,
        closingQuantity: closingQty,
        lastPurchaseRate: lastPurchaseRate,
        closingBalance: closingValue,
        transactionCount: item.transactionCount,
      },
      transactions: item.transactions,
    };
  });

  // Handle items with no transactions in the period
  itemIds.forEach((id) => {
    const itemKey = id.toString();
    if (!ledgerMap[itemKey]) {
      const openingQty = openingBalances[itemKey] || 0;
      const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
      const closingValue = openingQty * lastPurchaseRate;

      ledgerMap[itemKey] = {
        openingQuantity: openingQty,
        summary: {
          totalIn: 0,
          totalOut: 0,
          amountIn: 0,
          amountOut: 0,
          closingQuantity: openingQty,
          lastPurchaseRate: lastPurchaseRate,
          closingBalance: closingValue,
          transactionCount: 0,
        },
        transactions: [],
      };
    }
  });

  // Combine results
  const ledgersPerItem = itemsPage.map((row) => {
    const itemKey = row._id.toString();
    const data = ledgerMap[itemKey];

    return {
      _id: row._id,
      itemName: row.itemName,
      itemCode: row.itemCode,
      unit: row.unit,
      openingQuantity: data.openingQuantity,
      summary: data.summary,
      transactions: data.transactions,
    };
  });

  const totalTime = Date.now() - reportStartTime;
  console.log(
    `=== getSimpleLedgerReport (FAST PATH) END - ${totalTime}ms ===\n`
  );

  return {
    items: ledgersPerItem,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
    },
    filters: {
      company,
      branch,
      startDate,
      endDate,
      transactionType: transactionType || "all",
      searchTerm: searchTerm || null,
    },
  };
};

/* =========================================================================
   ⚡ PATH 2: HYBRID PATH (Dirty opening, clean ledger)
   ========================================================================= */

/**
 * Get hybrid ledger report (HYBRID PATH)
 *
 * Used when:
 * - Report starts mid-month OR no clean monthly balance for all items
 * - BUT no adjustments in report period
 *
 * Process:
 * 1. Calculate opening with dirty period (uses getBatchOpeningBalances)
 * 2. Simple aggregation for ledger (NO $lookup - no adjustments in period)
 * 3. Calculate summaries
 *
 * Performance: ~220-280ms for 15 items
 * (Slower than fast path due to opening calculation, but faster than full refold)
 *
 * @param {Object} params - Parameters object
 * @returns {Object} Report data { items, pagination, filters }
 */
export const getHybridLedgerReport = async ({
  company,
  branch,
  startDate,
  endDate,
  item = null,
  transactionType = null,
  page = 1,
  limit = 50,
  searchTerm = null,
}) => {
  console.log("=== getHybridLedgerReport (HYBRID PATH) START ===");
  const reportStartTime = Date.now();

  const companyId = toObjectId(company);
  const branchId = toObjectId(branch);
  const itemFilter = item ? toObjectId(item) : null;

  const baseMatch = {
    company: companyId,
    branch: branchId,
    transactionDate: { $gte: startDate, $lte: endDate },
  };
  if (itemFilter) baseMatch.item = itemFilter;

  if (transactionType === "sale") {
    baseMatch.transactionType = { $in: ["sale", "sales_return"] };
  } else if (transactionType === "purchase") {
    baseMatch.transactionType = { $in: ["purchase", "purchase_return"] };
  }

  let searchStage = {};
  if (searchTerm) {
    const regex = new RegExp(searchTerm, "i");
    searchStage = {
      $or: [{ itemName: regex }, { itemCode: regex }],
    };
  }

  /* -----------------------------------------------------------------------
     QUERY 1: Get paginated item list (same as other paths)
     ----------------------------------------------------------------------- */
  console.time("Query 1: Item list");
  const itemFacet = await ItemLedger.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: "$item",
        itemName: { $first: "$itemName" },
        itemCode: { $first: "$itemCode" },
        unit: { $first: "$unit" },
      },
    },
    ...(searchTerm ? [{ $match: searchStage }] : []),
    { $sort: { itemName: 1, itemCode: 1 } },
    {
      $facet: {
        meta: [{ $count: "totalItems" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ]);
  console.timeEnd("Query 1: Item list");

  const totalItems = itemFacet[0]?.meta[0]?.totalItems || 0;
  const itemsPage = itemFacet[0]?.data || [];

  if (itemsPage.length === 0) {
    console.log("No items found, returning empty result");
    return {
      items: [],
      pagination: {
        page,
        limit,
        totalItems: 0,
        totalPages: 0,
      },
      filters: {
        company,
        branch,
        startDate,
        endDate,
        transactionType: transactionType || "all",
        searchTerm: searchTerm || null,
      },
    };
  }

  const itemIds = itemsPage.map((row) => row._id.toString());
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  console.log(`Processing ${itemIds.length} items`);

  /* -----------------------------------------------------------------------
     QUERY 2: Calculate opening balances with dirty period
     Uses getBatchOpeningBalances which handles adjustments/movements
     ----------------------------------------------------------------------- */
  console.time("Query 2: Calculate opening balances");
  const openingBalances = await getBatchOpeningBalances(
    company,
    branch,
    itemIds,
    startDate
  );
  console.timeEnd("Query 2: Calculate opening balances");

  console.log(
    `Opening balances calculated for ${
      Object.keys(openingBalances).length
    } items`
  );

  /* -----------------------------------------------------------------------
     QUERY 3: Get last purchase rates
     ----------------------------------------------------------------------- */
  console.time("Query 3: Last purchase rates");
  const lastPurchaseRates = await getBatchLastPurchaseRates(
    companyId,
    branchId,
    itemIds,
    startDate,
    endDate
  );
  console.timeEnd("Query 3: Last purchase rates");

  /* -----------------------------------------------------------------------
     QUERY 4: Simple ledger for report period (NO $lookup!)
     No adjustments in report period, so simple aggregation works
     ----------------------------------------------------------------------- */
  console.time("Query 4: Simple ledger for report period");

  // Get stock movement conditions based on transactionType
  const { inCondition, outCondition } =
    getStockMovementConditions(transactionType);

  const ledgers = await ItemLedger.aggregate([
    { $match: baseMatch },

    // NO $lookup! Report period is clean (no adjustments)

    { $sort: { item: 1, transactionDate: 1, createdAt: 1, _id: 1 } },

    {
      $group: {
        _id: "$item",
        transactions: { $push: "$$ROOT" },
        totalIn: {
          $sum: {
            $cond: [inCondition, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [outCondition, "$quantity", 0],
          },
        },
        amountIn: {
          $sum: {
            $cond: [
              inCondition,
              { $add: [{ $multiply: ["$quantity", "$rate"] }, "$taxAmount"] },
              0,
            ],
          },
        },
        amountOut: {
          $sum: {
            $cond: [
              outCondition,
              { $add: [{ $multiply: ["$quantity", "$rate"] }, "$taxAmount"] },
              0,
            ],
          },
        },
        transactionCount: { $sum: 1 },
      },
    },
  ]);
  console.timeEnd("Query 4: Simple ledger for report period");

  console.log(`Ledger data processed for ${ledgers.length} items`);

  // Build ledger map
  const ledgerMap = {};

  ledgers.forEach((item) => {
    const itemKey = item._id.toString();
    const openingQty = openingBalances[itemKey] || 0;
    const closingQty = openingQty + item.totalIn - item.totalOut;
    const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
    const closingValue = closingQty * lastPurchaseRate;

    ledgerMap[itemKey] = {
      openingQuantity: openingQty,
      summary: {
        totalIn: item.totalIn,
        totalOut: item.totalOut,
        amountIn: item.amountIn,
        amountOut: item.amountOut,
        closingQuantity: closingQty,
        lastPurchaseRate: lastPurchaseRate,
        closingBalance: closingValue,
        transactionCount: item.transactionCount,
      },
      transactions: item.transactions,
    };
  });

  // Handle items with no transactions in the period
  itemIds.forEach((id) => {
    const itemKey = id.toString();
    if (!ledgerMap[itemKey]) {
      const openingQty = openingBalances[itemKey] || 0;
      const lastPurchaseRate = lastPurchaseRates[itemKey] || 0;
      const closingValue = openingQty * lastPurchaseRate;

      ledgerMap[itemKey] = {
        openingQuantity: openingQty,
        summary: {
          totalIn: 0,
          totalOut: 0,
          amountIn: 0,
          amountOut: 0,
          closingQuantity: openingQty,
          lastPurchaseRate: lastPurchaseRate,
          closingBalance: closingValue,
          transactionCount: 0,
        },
        transactions: [],
      };
    }
  });

  // Combine results
  const ledgersPerItem = itemsPage.map((row) => {
    const itemKey = row._id.toString();
    const data = ledgerMap[itemKey];

    return {
      _id: row._id,
      itemName: row.itemName,
      itemCode: row.itemCode,
      unit: row.unit,
      openingQuantity: data.openingQuantity,
      summary: data.summary,
      transactions: data.transactions,
    };
  });

  const totalTime = Date.now() - reportStartTime;
  console.log(
    `=== getHybridLedgerReport (HYBRID PATH) END - ${totalTime}ms ===\n`
  );

  return {
    items: ledgersPerItem,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
    },
    filters: {
      company,
      branch,
      startDate,
      endDate,
      transactionType: transactionType || "all",
      searchTerm: searchTerm || null,
    },
  };
};

/* =========================================================================
   🔄 PATH 3: FULL REFOLD (Adjustments in report period)
   ========================================================================= */

/**
 * Refold ledgers with adjustments (FULL REFOLD)
 *
 * Used when:
 * - Items missing monthly balance data
 * - OR adjustments exist in report period
 *
 * Process:
 * 1. Calculate opening balances (handles dirty period)
 * 2. Get ledger data WITH $lookup to adjustments (expensive!)
 * 3. Apply adjustment deltas to calculate effective values
 * 4. Calculate summaries
 *
 * Performance: ~300-350ms for 15 items
 * (Slowest path due to $lookup, but necessary when adjustments exist)
 *
 * @param {Object} params - Parameters object
 * @returns {Object} Report data { items, pagination, filters }
 */
export const refoldLedgersWithAdjustments = async ({
  company,
  branch,
  startDate,
  endDate,
  item = null,
  transactionType = null,
  page = 1,
  limit = 50,
  searchTerm = null,
}) => {
  console.log("=== refoldLedgersWithAdjustments (FULL REFOLD) START ===");
  const reportStartTime = Date.now();

  const companyId = toObjectId(company);
  const branchId = toObjectId(branch);
  const itemFilter = item ? toObjectId(item) : null;

  const baseMatch = {
    company: companyId,
    branch: branchId,
    transactionDate: { $gte: startDate, $lte: endDate },
  };
  if (itemFilter) baseMatch.item = itemFilter;

  if (transactionType === "sale") {
    baseMatch.transactionType = { $in: ["sale", "sales_return"] };
  } else if (transactionType === "purchase") {
    baseMatch.transactionType = { $in: ["purchase", "purchase_return"] };
  }

  let searchStage = {};
  if (searchTerm) {
    const regex = new RegExp(searchTerm, "i");
    searchStage = {
      $or: [{ itemName: regex }, { itemCode: regex }],
    };
  }

  /* -----------------------------------------------------------------------
     QUERY 1: Get paginated item list (same as other paths)
     ----------------------------------------------------------------------- */
  console.time("Query 1: Item list");
  const itemFacet = await ItemLedger.aggregate([
    { $match: baseMatch },
    {
      $group: {
        _id: "$item",
        itemName: { $first: "$itemName" },
        itemCode: { $first: "$itemCode" },
        unit: { $first: "$unit" },
      },
    },
    ...(searchTerm ? [{ $match: searchStage }] : []),
    { $sort: { itemName: 1, itemCode: 1 } },
    {
      $facet: {
        meta: [{ $count: "totalItems" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ]);

  console.timeEnd("Query 1: Item list");

  const totalItems = itemFacet[0]?.meta[0]?.totalItems || 0;
  const itemsPage = itemFacet[0]?.data || [];

  if (itemsPage.length === 0) {
    console.log("No items found, returning empty result");
    return {
      items: [],
      pagination: {
        page,
        limit,
        totalItems: 0,
        totalPages: 0,
      },
      filters: {
        company,
        branch,
        startDate,
        endDate,
        transactionType: transactionType || "all",
        searchTerm: searchTerm || null,
      },
    };
  }

  const itemIds = itemsPage.map((row) => row._id.toString());
  const itemIdObjs = itemIds.map((id) => toObjectId(id));

  console.log(`Processing ${itemIds.length} items`);

  /* -----------------------------------------------------------------------
     QUERY 2: Calculate opening balances
     ----------------------------------------------------------------------- */
  console.time("Query 2: Calculate opening balances");
  const openingBalances = await getBatchOpeningBalances(
    company,
    branch,
    itemIds,
    startDate
  );
  console.timeEnd("Query 2: Calculate opening balances");

  /* -----------------------------------------------------------------------
     QUERY 3: Get last purchase rates
     ----------------------------------------------------------------------- */
  console.time("Query 3: Last purchase rates");
  const lastPurchaseRates = await getBatchLastPurchaseRates(
    companyId,
    branchId,
    itemIds,
    startDate,
    endDate
  );
  console.timeEnd("Query 3: Last purchase rates");

  /* -----------------------------------------------------------------------
     QUERY 4: Get adjusted ledger data (with $lookup)
     This is the expensive part!
     ----------------------------------------------------------------------- */
  console.time("Query 4: Adjusted ledger data");
  const ledgerMap = await getBatchAdjustedLedgers({
    companyId,
    branchId,
    itemIds,
    startDate,
    endDate,
    openingBalances,
    lastPurchaseRates,
    transactionType,
  });

  console.log("ledger map", ledgerMap);

  console.timeEnd("Query 4: Adjusted ledger data");

  // Combine results
  const ledgersPerItem = itemsPage.map((row) => {
    const itemKey = row._id.toString();
    const data = ledgerMap[itemKey];

    return {
      _id: row._id,
      itemName: row.itemName,
      itemCode: row.itemCode,
      unit: row.unit,
      openingQuantity: data.openingQuantity,
      summary: data.summary,
      transactions: data.transactions,
    };
  });

  const totalTime = Date.now() - reportStartTime;
  console.log(
    `=== refoldLedgersWithAdjustments (FULL REFOLD) END - ${totalTime}ms ===\n`
  );

  return {
    items: ledgersPerItem,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1,
    },
    filters: {
      company,
      branch,
      startDate,
      endDate,
      transactionType: transactionType || "all",
      searchTerm: searchTerm || null,
    },
  };
};
