import { isMasterReferenced } from "../../helpers/MasterHelpers/masterHelper.js";
import mongoose from "mongoose";

import ItemMasterModel from "../../model/masters/ItemMasterModel.js";
import {SalesModel,PurchaseModel} from "../../model/TransactionModel.js";
import {SalesReturnModel,PurchaseReturnModel} from "../../model/TransactionModel.js";
import OutstandingModel from "../../model/OutstandingModel.js";
import ItemLedger from "../../model/ItemsLedgerModel.js";
// import {PaymentModel,ReceiptModel} from "../../model/FundTransactionMode.js";
export const create = async (req, res) => {
  try {
    const item = await ItemMasterModel.create(req.body);
    res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: { item },
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[1]; // Gets 'itemName' or 'itemCode'

      // This message is sent to frontend
      return res.status(400).json({
        success: false,
        message: `An item with this ${field} already exists for this company`,
      });
    }
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAll = async (req, res) => {
  try {
    const { companyId, page = 1, limit = 20, search = "" } = req.query;

    const query = { company: companyId };
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: "i" } },
        { itemCode: { $regex: search, $options: "i" } },
      ];
    }

    const items = await ItemMasterModel.find(query)
      .populate("stock.branch", "branchName")
      .limit(limit)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await ItemMasterModel.countDocuments(query);

    res.status(200).json({
      success: true,
      data: { items, total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getById = async (req, res) => {
  try {
    const item = await ItemMasterModel.findById(req.params.id).populate(
      "stock.branch",
      "branchName"
    );
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }
    res.status(200).json({
      success: true,
      data: { item },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const update = async (req, res) => {
  try {
    // Clone req.body to avoid mutating it directly
    const updateData = { ...req.body };

    // Remove priceLevel field if it exists in the update data
    if ("priceLevels" in updateData) {
      delete updateData.priceLevels;
    }

    // Remove stock field if it exists in the update data
    if ("stock" in updateData) {
      delete updateData.stock;
    }

    const item = await ItemMasterModel.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // Update item fields except stock
    Object.keys(updateData).forEach((key) => {
      item[key] = updateData[key];
    })

    
    await item.save();
    res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: { item },
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[1]; // Gets 'itemName' or 'itemCode'

      return res.status(400).json({
        success: false,
        message: `An item with this ${field} already exists for this company`,
      });
    }
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


export const deleteItem = async (req, res) => {
  try {
    const itemId = req.params.id;

    // Define which collections and fields to check for references
    const referencesToCheck = [
      { model: SalesModel, field: "items.item" },
      { model: PurchaseModel, field: "items.item" },
         { model: SalesReturnModel, field: "items.item" },
            { model: PurchaseReturnModel, field: "items.item" },
            
      // Add other transaction models and fields here
    ];

    const inUse = await isMasterReferenced(referencesToCheck, itemId);
    if (inUse) {
      return res.status(400).json({
        success: false,
        message: "Item is used in transactions and cannot be deleted.",
      });
    }

    const item = await ItemMasterModel.findByIdAndDelete(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateRate = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { priceLevelId, rate } = req.body;

    // Validate inputs
    if (!priceLevelId || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: "Price level ID and rate are required",
      });
    }

    if (rate < 0) {
      return res.status(400).json({
        success: false,
        message: "Rate cannot be negative",
      });
    }

    // Find the item
    const item = await ItemMasterModel.findById(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // Check if price level already exists in the item
    const existingPriceLevelIndex = item.priceLevels.findIndex(
      (pl) => pl.priceLevel.toString() === priceLevelId
    );

    if (existingPriceLevelIndex >= 0) {
      // Update existing price level
      item.priceLevels[existingPriceLevelIndex].rate = rate;
    } else {
      // Add new price level
      item.priceLevels.push({
        priceLevel: priceLevelId,
        rate: rate,
      });
    }

    await item.save();

    res.status(200).json({
      success: true,
      data: item,
      message: "Rate updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateIndexes = async () => {
  try {
    // Drop existing indexes
    // await ItemMasterModel.collection.dropIndex("company_1_itemName_1");
    // await ItemMasterModel.collection.dropIndex("company_1_itemCode_1");

    // console.log("Old indexes dropped");

    // // Create new case-insensitive indexes
    // await ItemMasterModel.collection.createIndex(
    //   { company: 1, itemName: 1 },
    //   {
    //     unique: true,
    //     collation: { locale: "en", strength: 2 },
    //   }
    // );

    await AccountMasterModel.collection.createIndex(
      { company: 1, accountName: 1 },
      {
        unique: true,
        collation: { locale: "en", strength: 2 },
      }
    );

    console.log("New case-insensitive indexes created");
  } catch (error) {
    console.error("Error updating indexes:", error);
  }
};

//// for searching an item


export const searchItems = async (req, res) => {
  console.log("call came here");
  
  const {
    searchTerm,
    companyId,
    branchId,
    accountId,
    transactionType,
    limit = 25,
    exactMatch = false,
  } = req.query;

  try {
    const items = await ItemMasterModel.searchItems(
      searchTerm,
      companyId,
      branchId,
      limit,
      exactMatch === "true"
    );

    // If accountId and transactionType provided, fetch last rate from Transaction tables
    if (accountId && transactionType && items.length > 0) {
      console.log("✅ Fetching last rates");
      
      const itemsWithLastRate = await Promise.all(
        items.map(async (item) => {
          const itemObj = item.toObject ? item.toObject() : { ...item };
          
          let lastTransaction = null;
          
          if (transactionType === "sale" || transactionType === "sales_return") {
            // Simple find query instead of aggregation
            const salesTx = await SalesModel.findOne({
             
              company: companyId,
              branch: branchId,
              status: { $ne: "cancelled" },
              "items.item": itemObj._id
            })
            .sort({ transactionDate: -1, createdAt: -1 })
            .select('items transactionType transactionDate')
            .lean();
            
            if (salesTx) {
              const itemInTx = salesTx.items.find(i => i.item.toString() === itemObj._id.toString());
              if (itemInTx) {
                lastTransaction = {
                  rate: itemInTx.rate,
                  transactionType: salesTx.transactionType,
                  transactionDate: salesTx.transactionDate
                };
              }
            }
          } else if (transactionType === "purchase" || transactionType === "purchase_return") {
            const purchaseTx = await PurchaseModel.findOne({
              account: accountId,
              company: companyId,
              branch: branchId,
              status: { $ne: "cancelled" },
              "items.item": itemObj._id
            })
            .sort({ transactionDate: -1, createdAt: -1 })
            .select('items transactionType transactionDate')
            .lean();
            
            if (purchaseTx) {
              const itemInTx = purchaseTx.items.find(i => i.item.toString() === itemObj._id.toString());
              if (itemInTx) {
                lastTransaction = {
                  rate: itemInTx.rate,
                  transactionType: purchaseTx.transactionType,
                  transactionDate: purchaseTx.transactionDate
                };
              }
            }
          }
          
          if (lastTransaction) {
            itemObj.lastRate = lastTransaction.rate;
            itemObj.lastTransactionType = lastTransaction.transactionType;
            itemObj.lastTransactionDate = lastTransaction.transactionDate;
            console.log(`✅ Found last rate for ${itemObj.itemName}:`, lastTransaction.rate);
          } else {
            console.log(`❌ No last rate found for ${itemObj.itemName}`);
          }
          
          return itemObj;
        })
      );
      
      return res.json({ data: itemsWithLastRate, message: "items found" });
    }

    // ✅ ADDED: Response when accountId/transactionType not provided
    res.json({ data: items, message: "items found" });
    
  } catch (error) {
    // ✅ ADDED: Error handling
    console.error("Search items error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


