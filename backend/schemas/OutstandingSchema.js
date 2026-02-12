import mongoose from "mongoose";

const OutstandingSchema = new mongoose.Schema(
  {
    // ... (your existing schema fields - keep them as is)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch is required"],
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountMaster",
      required: [true, "Account is required"],
    },
    accountName: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
    },
    accountType: {
      type: String,
      enum: {
        values: ["customer", "supplier", "bank", "cash"],
        message: "Account type must be either customer or supplier",
      },
      required: [true, "Account type is required"],
    },

    transactionModel: {
      type: String,
      required: [true, "Transaction model is required"],
      enum: [
        "Sale",
        "Purchase",
        "SalesReturn",
        "PurchaseReturn",
        "OpeningBalance",
        "Receipt",
        "Payment",
        "YearOpeningAdjustment",
      ],
    },
    sourceTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "transactionModel",
      required: function () {
        // Required only if transactionModel is NOT 'OpeningBalance'
        return this.transactionModel !== "OpeningBalance";
      },
    },
    transactionType: {
      type: String,
      enum: {
        values: [
          "sale",
          "purchase",
          "sales_return",
          "purchase_return",
          "opening_balance",
          "advance_receipt",
          "advance_payment",
          "opening_adjustment",
        ],
        message: "Invalid transaction type",
      },
      required: [true, "Transaction type is required"],
    },
    transactionNumber: {
      type: String,
      required: [true, "Transaction number is required"],
      trim: true,
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
    },
    outstandingType: {
      type: String,
      enum: {
        values: ["dr", "cr"],
        message: "Outstanding type must be either dr (debit) or cr (credit)",
      },
      required: [true, "Outstanding type is required"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },
    closingBalanceAmount: {
      type: Number,
      required: [true, "Balance amount is required"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    status: {
      type: String,
      enum: {
        values: [
          "pending",
          "partial",
          "paid",
          "overdue",
          "disputed",
          "written_off",
          "settled",
          "cancelled",
        ],
        message: "Invalid status",
      },
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
OutstandingSchema.index({ account: 1, status: 1 });
OutstandingSchema.index({ dueDate: 1, status: 1 });
OutstandingSchema.index({ sourceTransaction: 1 });
OutstandingSchema.index({ transactionNumber: 1 });

// ==================== VIRTUALS ====================
// Check if overdue
OutstandingSchema.virtual("isOverdue").get(function () {
  return (
    new Date() > this.dueDate &&
    this.closingBalanceAmount > 0 &&
    this.status !== "paid"
  );
});

// Days overdue
OutstandingSchema.virtual("daysOverdue").get(function () {
  if (!this.isOverdue) return 0;
  const diffTime = new Date() - this.dueDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Payment percentage
OutstandingSchema.virtual("paymentPercentage").get(function () {
  if (this.totalAmount === 0) return 100;
  return Math.round((this.paidAmount / this.totalAmount) * 100);
});

// Outstanding type display name
OutstandingSchema.virtual("typeDisplayName").get(function () {
  return this.outstandingType === "dr" ? "Receivable" : "Payable";
});

// Check if fully paid
OutstandingSchema.virtual("isFullyPaid").get(function () {
  return this.paidAmount >= this.totalAmount;
});

// ==================== INSTANCE METHODS ====================
// Update payment

OutstandingSchema.methods.updatePayment = function (paymentAmount) {
  if (paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  if (this.paidAmount + paymentAmount > this.totalAmount) {
    throw new Error("Payment amount exceeds balance");
  }

  this.paidAmount += paymentAmount;
  this.closingBalanceAmount = this.totalAmount - this.paidAmount;

  // Update status
  if (this.closingBalanceAmount === 0) {
    this.status = "paid";
  } else if (this.paidAmount > 0) {
    this.status = "partial";
  }

  // // Check if overdue
  // if (this.isOverdue && this.status !== "paid") {
  //   this.status = "overdue";
  // }

  return this.save();
};

// Update status
OutstandingSchema.methods.updateStatus = function (newStatus) {
  const validStatuses = [
    "pending",
    "partial",
    "paid",
    "overdue",
    "disputed",
    "written_off",
  ];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status");
  }

  this.status = newStatus;
  return this.save();
};

// Mark as paid
OutstandingSchema.methods.markAsPaid = function () {
  this.paidAmount = this.totalAmount;
  this.closingBalanceAmount = 0;
  this.status = "paid";
  return this.save();
};

// // Instance method to check if overdue
// OutstandingSchema.methods.checkOverdue = function () {
//   const isOverdue = new Date() > this.dueDate && this.closingBalanceAmount > 0;
//   if (isOverdue && this.status !== "overdue") {
//     this.status = "overdue";
//   }
//   return isOverdue;
// };

// Instance method to calculate aging days
OutstandingSchema.methods.calculateAgingDays = function () {
  const today = new Date();
  const diffTime = today - this.dueDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

// ==================== STATIC METHODS ====================
// Get receivables (DR - customers owe you money)
OutstandingSchema.statics.getReceivables = function (companyId, filters = {}) {
  return this.find({
    company: companyId,
    outstandingType: "dr",
    status: { $ne: "paid" },
    ...filters,
  })
    .populate("account", "accountName phoneNo")
    .populate("branch", "name")
    .sort({ dueDate: 1, transactionDate: -1 });
};

// Get payables (CR - you owe suppliers money)
OutstandingSchema.statics.getPayables = function (companyId, filters = {}) {
  return this.find({
    company: companyId,
    outstandingType: "cr",
    status: { $ne: "paid" },
    ...filters,
  })
    .populate("account", "accountName phoneNo")
    .populate("branch", "name")
    .sort({ dueDate: 1, transactionDate: -1 });
};

// Get overdue items
OutstandingSchema.statics.getOverdueItems = function (
  companyId,
  outstandingType = null,
) {
  const matchConditions = {
    company: companyId,
    dueDate: { $lt: new Date() },
    closingBalanceAmount: { $gt: 0 },
    status: { $ne: "paid" },
  };

  if (outstandingType) {
    matchConditions.outstandingType = outstandingType;
  }

  return this.find(matchConditions)
    .populate("account", "accountName phoneNo")
    .sort({ dueDate: 1 });
};

// Get outstanding summary
OutstandingSchema.statics.getOutstandingSummary = function (companyId) {
  return this.aggregate([
    { $match: { company: companyId, status: { $ne: "paid" } } },
    {
      $group: {
        _id: "$outstandingType",
        totalOutstanding: { $sum: "$closingBalanceAmount" },
        totalOverdue: {
          $sum: {
            $cond: [
              { $lt: ["$dueDate", new Date()] },
              "$closingBalanceAmount",
              0,
            ],
          },
        },
        count: { $sum: 1 },
      },
    },
  ]);
};

// Static method to find pending outstanding by account
OutstandingSchema.statics.findPendingByAccount = async function (accountId) {
  return await this.find({
    account: accountId,
    status: { $in: ["pending", "partial", "overdue"] },
  }).sort({ dueDate: 1 });
};

// Static method to get aging report
OutstandingSchema.statics.getAgingReport = async function (
  accountId,
  asOfDate = new Date(),
) {
  const outstandingRecords = await this.find({
    account: accountId,
    status: { $in: ["pending", "partial", "overdue"] },
  });

  const aging = {
    current: 0, // 0-30 days
    days31_60: 0, // 31-60 days
    days61_90: 0, // 61-90 days
    over90: 0, // 90+ days
    total: 0,
  };

  outstandingRecords.forEach((record) => {
    const agingDays = Math.ceil(
      (asOfDate - record.dueDate) / (1000 * 60 * 60 * 24),
    );
    const amount = record.closingBalanceAmount;

    if (agingDays <= 30) {
      aging.current += amount;
    } else if (agingDays <= 60) {
      aging.days31_60 += amount;
    } else if (agingDays <= 90) {
      aging.days61_90 += amount;
    } else {
      aging.over90 += amount;
    }

    aging.total += amount;
  });

  return aging;
};

// Static method to get total outstanding
OutstandingSchema.statics.getTotalOutstanding = async function (
  accountId,
  outstandingType,
) {
  const result = await this.aggregate([
    {
      $match: {
        account: mongoose.Types.ObjectId(accountId),
        outstandingType: outstandingType,
        status: { $in: ["pending", "partial", "overdue"] },
      },
    },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: "$closingBalanceAmount" },
      },
    },
  ]);

  return result.length > 0 ? result[0].totalOutstanding : 0;
};

// ==================== PRE MIDDLEWARE ====================
// Update status based on amounts and due date before saving
OutstandingSchema.pre("save", function (next) {
  // Normalize transactionType
  // if (this.transactionType === "sale") {
  //   this.transactionType = "sales";
  // }
  // Calculate balance amount
  this.closingBalanceAmount = this.totalAmount - this.paidAmount;

  // Auto-update status based on payment
  if (this.closingBalanceAmount === 0) {
    this.status = "paid";
  } else if (this.paidAmount > 0 && this.status === "pending") {
    this.status = "partial";
  }

  // Check for overdue status
  // if (
  //   this.closingBalanceAmount > 0 &&
  //   new Date() > this.dueDate &&
  //   this.status !== "disputed" &&
  //   this.status !== "written_off"
  // ) {
  //   this.status = "overdue";
  // }

  /// if outstandingType is cr closingBalanceAmount should be negative
  if (this.outstandingType === "cr") {
    this.closingBalanceAmount = -Math.abs(this.closingBalanceAmount);
  }
  if (this.outstandingType === "dr") {
    this.closingBalanceAmount = Math.abs(this.closingBalanceAmount);
  }

  next();
});

export default OutstandingSchema;
