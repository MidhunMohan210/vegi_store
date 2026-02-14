import mongoose from "mongoose";

export const AccountLedgerSchema = new mongoose.Schema(
  {
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
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: [true, "Transaction is required"],
    },
    transactionNumber: {
      type: String,
      required: [true, "Transaction number is required"],
    },
    transactionDate: {
      type: Date,
      required: [true, "Transaction date is required"],
    },
    transactionType: {
      type: String,
      enum: [
        "sale",
        "purchase",
        "sales_return",
        "purchase_return",
        "receipt",
        "payment",
      ],
      required: [true, "Transaction type is required"],
    },
    ledgerSide: {
      type: String,
      enum: ["debit", "credit"],
      required: [true, "Ledger side is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    runningBalance: {
      type: Number,
      required: [true, "Running balance is required"],
    },
    narration: {
      type: String,
      trim: true,
      maxlength: [500, "Narration cannot exceed 500 characters"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
AccountLedgerSchema.index({ account: 1, transactionDate: 1 });
AccountLedgerSchema.index({ company: 1, branch: 1 });
AccountLedgerSchema.index({ transactionId: 1 });
AccountLedgerSchema.index({ account: 1, branch: 1, transactionDate: 1 });

// Static method to get last balance for an account
AccountLedgerSchema.statics.getLastBalance = async function (
  accountId,
  companyId,
  branchId,
  session,
) {
  // Try to get last ledger entry
  const lastEntry = await this.findOne({
    account: accountId,
    branch: branchId,
    company: companyId,
  })
    .sort({ transactionDate: -1, createdAt: -1 })
    .session(session);

  // If ledger entry exists, return its running balance
  if (lastEntry) {
    return lastEntry.runningBalance || 0;
  }

  // No ledger entries found - get opening balance from AccountMaster
  const accountMaster = await mongoose
    .model("AccountMaster")
    .findOne({
      _id: accountId,
      branches: branchId,
      company: companyId,
    })
    .select("openingBalance openingBalanceType")
    .session(session);

  if (!accountMaster) throw new Error("Account not found");

  const openingBalance = accountMaster.openingBalance || 0;



  

  if (accountMaster?.openingBalanceType == "cr") {
    return -Math.abs(openingBalance);
  } else {
    return openingBalance;
  }
};
