import mongoose from "mongoose";
import { nanoid } from "nanoid";

// Base schema for fund transactions
export const FundTransactionSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    transactionType: {
      type: String,
      enum: ["receipt", "payment"], // ✅ fixed spelling
      required: true,
    },

    transactionType: {
      type: String,
      enum: ["receipt", "payment"], // ✅ fixed spelling
      required: true,
    },
    transactionNumber: {
      type: String,

      required: true,
      default: function () {
        // 'this' will have __t field which is the discriminator value
        const prefix = this.__t?.toUpperCase().slice(0, 3) || "TXN";
        return `${prefix}-${nanoid(8)}`;
      },
    },

    transactionDate: { type: Date, required: true, default: Date.now },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountMaster",
      required: true,
    },
    accountName: { type: String, required: true, trim: true },
    previousBalanceAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    closingBalanceAmount: { type: Number, default: 0 },
    paymentMode: {
      type: String,
      enum: ["cash", "cheque", "dd", "bankTransfer"],
      default: "cash",
    },
    chequeNumber: String,
    chequeDate: Date,
    bank: String,
    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccountMaster",
    },
    narration: String,
    description: String,

    settlementDetails: [
      {
        outstandingTransaction: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Outstanding",
        },
        outstandingTransactionNumber: String,
        previousOutstanding: Number,
        settledAmount: Number,
        remainingOutstanding: Number,
        settlementDate: { type: Date, default: Date.now },
      },
    ],

    attachments: [
      {
        fileName: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    reference: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "referenceModel",
    },
    referenceModel: {
      type: String,
      enum: ["Sale", "Purchase"],
    },

    referenceType: {
      type: String,
      enum: ["sale", "purchase", "sales_return", "purchase_return"],
    },

    status: {
      type: String,
      enum: ["active", "cancelled", "voided"],
      default: "active",
      required: true,
      index: true,
    },

    isCancelled: {
      type: Boolean,
      default: false,
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      default: null,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  },
);

// Indexes
FundTransactionSchema.index({ company: 1, transactionNumber: 1 });
FundTransactionSchema.index({ company: 1 });
FundTransactionSchema.index({ branch: 1 });
FundTransactionSchema.index({ date: -1 });
FundTransactionSchema.index({ account: 1, transactionType: 1 });
FundTransactionSchema.index({ company: 1, branch: 1 });
receiptSchema.index({ status: 1, company: 1, branch: 1 });
receiptSchema.index({ isCancelled: 1, transactionDate: -1 });
receiptSchema.index({ account: 1, status: 1, branch: 1 });

FundTransactionSchema.statics.getPaginatedTransactions = async function (
  filter = {},
  page = 1,
  limit = 50,
  sort = { date: -1, _id: -1 },
) {
  const skip = (page - 1) * limit;

  const [total, transactions] = await Promise.all([
    this.countDocuments(filter),
    this.find(filter)
      .populate("account", "accountName")
      .select(
        "transactionNumber transactionDate amount previousBalanceAmount closingBalanceAmount settlementDetails",
      )
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    data: transactions,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      hasMore: skip + transactions.length < total,
      nextPage: skip + transactions.length < total ? page + 1 : null,
    },
  };
};

// Instance method to settle an amount FIFO
FundTransactionSchema.methods.settleAmountFIFO = async function (settleAmount) {
  // Implementation of FIFO settlement logic
  // Update settlementDetails accordingly
};

// Model export
// module.exports = mongoose.model('Transaction', FundTransactionSchema);
