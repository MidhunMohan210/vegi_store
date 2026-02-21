import mongoose from "mongoose";

const ItemMasterSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
    },
    itemName: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: [100, "Item name cannot exceed 100 characters"],
    },
    itemCode: {
      type: String,
      required: [true, "Item code is required"],
      trim: true,
     
    },
    category: {
      type: String,

      enum: {
        values: ["vegetables", "fruits", "leafy-greens", "herbs", "other"],
        message: "Invalid category type",
      },
    },
    unit: {
      type: String,
      required: [true, "Unit is required"],
      // enum: {
      //   values: ["kg", "gm", "piece", "bundle", "dozen", "liter"],
      //   message: "Invalid unit type",
      // },
    },

    // 🆕 Price levels (Retail, Wholesale, Catering, etc.)
    priceLevels: [
      {
        _id: false,
        priceLevel: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PriceLevelModel",
          required: [true, "Price level reference is required"],
        },
        rate: {
          type: Number,
          required: [true, "Rate is required"],
          min: [0, "Rate cannot be negative"],
        },
      },
    ],
    stock: {
      type: [
        {
          _id: false,
          branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: [true, "Branch is required"],
          },
          openingStock: {
            type: Number,
            default: 0,
            min: [0, "Opening stock cannot be negative"],
          },
          currentStock: {
            type: Number,
            default: 0,     
          },
          openingRate: {
            type: Number,
            default: 0,
            min: [0, "Opening rate cannot be negative"],
          },
        },
      ],
      validate: {
        validator: function (stockArray) {
          const branchIds = stockArray.map((s) => s.branch.toString());
          return branchIds.length === new Set(branchIds).size;
        },
        message: "Each branch can only have one stock entry per item",
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "discontinued"],
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ==================== INDEXES ====================
ItemMasterSchema.index({ company: 1, status: 1 });
ItemMasterSchema.index({ company: 1 });
ItemMasterSchema.index({ branch: 1, });
ItemMasterSchema.index({ category: 1, status: 1 });
ItemMasterSchema.index({ "stock.branch": 1 });
ItemMasterSchema.index({ company: 1, "stock.branch": 1 });
ItemMasterSchema.index({ itemName: "text", itemCode: "text" });
// Compound unique index: itemName must be unique per company
// Case-insensitive unique index: itemName must be unique per company (case-insensitive)
ItemMasterSchema.index(
  { company: 1, itemName: 1 }, 
  { 
    unique: true,
    collation: { locale: 'en', strength: 2 }
  }
);

// Case-insensitive unique index: itemCode must be unique per company (case-insensitive)
ItemMasterSchema.index(
  { company: 1, itemCode: 1 }, 
  { 
    unique: true,
    collation: { locale: 'en', strength: 2 }
  }
);




// ==================== VIRTUALS ====================

// Branch IDs
ItemMasterSchema.virtual("allocatedBranches").get(function () {
  return this.stock.map((s) => s.branch);
});

// Count of branches
ItemMasterSchema.virtual("branchCount").get(function () {
  return this.stock.length;
});

// Total stock across all branches
ItemMasterSchema.virtual("totalStock").get(function () {
  return this.stock.reduce((total, s) => total + s.currentStock, 0);
});

// Check if item needs reorder in any branch (currentStock = 0)
ItemMasterSchema.virtual("needsReorder").get(function () {
  return this.stock.some((s) => s.currentStock <= 0);
});

// Branch-wise summary
ItemMasterSchema.virtual("branchSummary").get(function () {
  return this.stock.map((s) => ({
    branch: s.branch,
    openingStock: s.openingStock,
    currentStock: s.currentStock,
    soldQty: s.openingStock - s.currentStock,
    needsReorder: s.currentStock <= 0,
  }));
});

// ==================== INSTANCE METHODS ====================

// Get stock entry for a branch
ItemMasterSchema.methods.getBranchStock = function (branchId) {
  return this.stock.find((s) => s.branch.toString() === branchId.toString());
};




// Reduce stock for a branch
ItemMasterSchema.methods.reduceStock = async function (branchId, qty) {
  const stockEntry = this.getBranchStock(branchId);
  if (!stockEntry) throw new Error("Branch not found");
  if (stockEntry.currentStock < qty) throw new Error("Not enough stock");

  stockEntry.currentStock -= qty;
  return this.save();
};

// Allocate item to a new branch
ItemMasterSchema.methods.allocateToBranch = function (branchId, options = {}) {
  const existingStock = this.getBranchStock(branchId);
  if (existingStock) throw new Error("Item already allocated to this branch");

  this.stock.push({
    branch: branchId,
    openingStock: options.openingStock || 0,
    currentStock: options.openingStock || 0,
  });

  return this.save();
};

// Remove item from branch
ItemMasterSchema.methods.removeFromBranch = function (branchId) {
  this.stock = this.stock.filter(
    (s) => s.branch.toString() !== branchId.toString()
  );
  return this.save();
};

// Check if item is available in branch
ItemMasterSchema.methods.isAvailableInBranch = function (branchId) {
  const stockEntry = this.getBranchStock(branchId);
  return stockEntry && stockEntry.currentStock > 0;
};

// ==================== STATIC METHODS ====================

// Get all items in a branch
ItemMasterSchema.statics.getItemsByBranch = function (branchId, filters = {}) {
  const matchStage = { "stock.branch": branchId, ...filters };
  return this.find(matchStage).populate("stock.branch", "name address");
};

// Get items needing attention (current stock <= 0)
ItemMasterSchema.statics.getOutOfStockItems = function (branchId) {
  return this.find({
    "stock.branch": branchId,
    "stock.currentStock": { $lte: 0 },
  });
};

//// search by item Code or itemName
ItemMasterSchema.statics.searchItems = async function (
  searchTerm,
  companyId,
  branchId,
  limit = 25,
  exactMatch = false
) {
  let searchCondition;

  if (exactMatch) {
  const searchRegex = new RegExp(`^${searchTerm}$`, "i"); // exact match, ignore case
  searchCondition = {
    $or: [{ itemCode: searchRegex }, { itemName: searchRegex }],
  };
}else {
    const searchRegex = new RegExp(searchTerm, "i");
    searchCondition = {
      $or: [{ itemCode: searchRegex }, { itemName: searchRegex }],
    };
  }

  const items = await this.find({
    ...searchCondition,
    company: companyId,
    "stock.branch": branchId,
  })
    .sort({
      itemCode: 1,
      itemName: 1,
    })
    .limit(parseInt(limit))
    .populate({
      path:"priceLevels.priceLevel",
      model:"PriceLevel",
      select:"priceLevelName "
    })
    .populate({
      path: "stock.branch",
      model: "Branch",
      select: "branchName ", // adjust fields to populate as needed
    })
    .lean();

    // console.log("items", items);
    

  // Filter stock by branchId for each item
  const filteredItems = items.map(item => ({
    ...item,
    stock: item.stock?.filter(stockEntry => 
      String(stockEntry.branch._id) === String(branchId)
    ) || []
  }));

  return filteredItems;
};

// Get branch-wise summary for all items
ItemMasterSchema.statics.getBranchWiseSummary = function (
  companyId,
  filters = {}
) {
  const matchStage = { company: companyId, ...filters };

  return this.aggregate([
    { $match: matchStage },
    { $unwind: "$stock" },
    {
      $group: {
        _id: "$stock.branch",
        totalItems: { $sum: 1 },
        totalStock: { $sum: "$stock.currentStock" },
        lowStockItems: {
          $sum: {
            $cond: [
              { $lte: ["$stock.currentStock", 0] }, // Consider low stock if currentStock <= 0
              1,
              0,
            ],
          },
        },
        items: {
          $push: {
            itemId: "$_id",
            itemName: "$itemName",
            itemCode: "$itemCode",
            category: "$category",
            unit: "$unit",
            openingStock: "$stock.openingStock",
            currentStock: "$stock.currentStock",
            needsReorder: { $lte: ["$stock.currentStock", 0] }, // Needs reorder if stock <= 0
          },
        },
      },
    },
    {
      $lookup: {
        from: "branches",
        localField: "_id",
        foreignField: "_id",
        as: "branchInfo",
      },
    },
    {
      $project: {
        branch: { $arrayElemAt: ["$branchInfo", 0] },
        totalItems: 1,
        totalStock: 1,
        lowStockItems: 1,
        items: 1,
      },
    },
  ]);
};

export default ItemMasterSchema;
