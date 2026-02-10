import mongoose from "mongoose";

export const syncIndexes = async (req, res) => {
  try {
    const modelNames = mongoose.modelNames();
    console.log("All models:", modelNames);

    for (const name of modelNames) {
      if (name === 'User') {
        console.log(`Skipped syncing indexes for model: ${name}`);
        continue;
      }

      console.log(`About to sync model: ${name}`);
      const model = mongoose.model(name);
      
      // Log what indexes this model will create
      console.log(`${name} schema indexes:`, model.schema.indexes());
      
      await model.syncIndexes();
      console.log(`✓ Synced indexes for model: ${name}`);
    }

    res.status(200).json({ message: "All indexes synced successfully" });
  } catch (error) {
    console.error("Index sync error:", error);
    res.status(500).json({ 
      message: "Index sync failed", 
      error: error.message 
    });
  }
};


export const fixAllTransactionIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    const collections = ["Sale", "Purchase", "Receipt", "Payment"]; // Add all your collection names: ['sales', 'purchases', 'receipts', 'payments']

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);

      try {
        await collection.dropIndex("transactionNumber_1");
        console.log(`✓ Dropped index from ${collectionName}`);
      } catch (err) {
        if (err.code === 27) {
          // Index not found
          console.log(`✓ No conflicting index in ${collectionName}`);
        } else {
          throw err;
        }
      }
    }

    // Now sync indexes
    await TransactionModel.syncIndexes();
    console.log("✓ All indexes synced successfully");
  } catch (error) {
    console.error("Error fixing indexes:", error);
  }
};

/// to delete all related data;


export const deleteData = async (req, res) => {
  try {
    const { account, company } = req.query;

    const modelNames = [
      "Sale",
      "Purchase",
      "Receipt",
      "Payment",
      "AccountLedger",
      "AccountMonthlyBalance",
      "ItemLedger",
      "ItemMonthlyBalance",
      "CashBankLedger",
      "Outstanding",
      "OutstandingSettlement",
      "AdjustmentEntry",
      "SalesReturn",
      "PurchaseReturn",
      "StockAdjustment",
      "OutstandingOffset",
      "YearOpeningAdjustment"
    ];

    const baseFilter = {};

    if (company) {
      baseFilter.company = new mongoose.Types.ObjectId(company);
    }
    if (account) {
      baseFilter.account = new mongoose.Types.ObjectId(account);
    }

    if (!company && !account) {
      return res.status(400).json({ message: "No filter provided" });
    }

    let totalDeleted = 0;
    const results = {};

    for (const modelName of modelNames) {
      try {
        const Model = mongoose.model(modelName);

        // Clone base filter
        let filter = { ...baseFilter };

        // 🚨 Ignore opening balance in Outstanding
        if (modelName === "Outstanding") {
          filter.transactionType = { $ne: "opening_balance" };
        }

        const result = await Model.deleteMany(filter);
        totalDeleted += result.deletedCount;
        results[modelName] = result.deletedCount;

        console.log(`✓ Deleted ${result.deletedCount} from ${modelName}`);
      } catch (err) {
        console.log(`✗ Error deleting from ${modelName}:`, err.message);
        results[modelName] = `Error: ${err.message}`;
      }
    }

    res.json({
      message: "Data deletion completed",
      filter: {
        company: company || undefined,
        account: account || undefined,
      },
      totalDeleted,
      details: results,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      message: "Error deleting data",
      error: error.message,
    });
  }
};




