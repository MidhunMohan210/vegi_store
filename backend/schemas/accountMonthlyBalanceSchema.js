import mongoose from "mongoose";

export const AccountMonthlyBalanceSchema = new mongoose.Schema(
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
    },
    month: {
      type: Number,
      required: [true, "Month is required"],
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: [true, "Year is required"],
    },
    periodKey: {
      type: String,
      required: [true, "Period key is required"],
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    totalDebit: {
      type: Number,
      default: 0,
      min: [0, "Total debit cannot be negative"],
    },
    totalCredit: {
      type: Number,
      default: 0,
      min: [0, "Total credit cannot be negative"],
    },
    closingBalance: {
      type: Number,
      default: 0,
    },
    transactionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    needsRecalculation: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for unique constraint and faster queries
AccountMonthlyBalanceSchema.index(
  { account: 1, periodKey: 1 },
  { unique: true },
);
AccountMonthlyBalanceSchema.index({ company: 1, branch: 1, periodKey: 1 });
AccountMonthlyBalanceSchema.index({ needsRecalculation: 1 });
AccountMonthlyBalanceSchema.index({ account: 1, branch: 1, year: 1, month: 1 });

// Static method to get opening balance for a specific month
AccountMonthlyBalanceSchema.statics.getOpeningBalance = async function (
  accountId,
  branchId,
  companyId,
  year,
  month,
  session,
) {
  // console.log(`\n[Get Opening Balance] Starting search...`);
  // console.log(`[Get Opening Balance] Account: ${accountId}`);
  // console.log(`[Get Opening Balance] Branch: ${branchId}`);
  // console.log(`[Get Opening Balance] Target: ${month}/${year}`);

  // ========================================
  // STEP 1: FIND MOST RECENT PREVIOUS MONTHLY BALANCE
  // ========================================
  // console.log(`[Get Opening Balance] Searching for most recent monthly balance before ${month}/${year}...`);

  // Find the most recent monthly balance before the target month/year
  const previousMonth = await this.findOne({
    company: companyId,
    branch: branchId,
    account: accountId,
    $or: [
      // Previous years (any month)
      { year: { $lt: year } },
      // Same year but previous months
      { year: year, month: { $lt: month } },
    ],
  })
    .select("closingBalance month year")
    .sort({ year: -1, month: -1 }) // Sort by year DESC, month DESC
    .session(session)
    .lean();

  if (previousMonth) {
    // console.log(`[Get Opening Balance] ✅ Found closing balance at ${previousMonth.month}/${previousMonth.year}: ${previousMonth.closingBalance}`);
    return previousMonth.closingBalance;
  }

  // console.log(`[Get Opening Balance] ⚠️ No previous monthly balance found`);

  // ========================================
  // STEP 2: NO PREVIOUS MONTH FOUND - GET FROM ACCOUNT MASTER
  // ========================================
  // console.log(`[Get Opening Balance] Fetching opening balance from AccountMaster...`);

  const accountMaster = await mongoose
    .model("AccountMaster")
    .findOne({
      _id: accountId,
      branches: branchId,
      company: companyId,
    })
    .select("openingBalance openingBalanceType")
    .session(session)
    .lean();

  if (!accountMaster) {
    console.log(`[Get Opening Balance] ❌ Account master not found, returning 0`);
    return 0;
  }

  const masterOpeningBalance = accountMaster.openingBalance || 0;
  // console.log(`[Get Opening Balance] ✅ Using master opening balance: ${masterOpeningBalance} (${accountMaster.openingBalanceType})`);

  return masterOpeningBalance;
};


// Method to calculate and update closing balance
AccountMonthlyBalanceSchema.methods.calculateClosingBalance = function () {
  this.closingBalance =
    this.openingBalance + this.totalDebit - this.totalCredit;
  return this.closingBalance;
};
