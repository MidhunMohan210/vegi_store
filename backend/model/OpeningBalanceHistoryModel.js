// models/OpeningBalanceHistory.js
import mongoose from "mongoose";

const openingBalanceHistorySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    branchScope: {
      type: String,
      enum: ["all", "single"],
      default: "all", // for master account opening
    },

    entityType: {
      type: String,
      enum: ["party", "item"],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Master opening belongs to first FY
    financialYearStart: {
      type: Number, // e.g. 2025
      required: true,
    },

    previousOpeningBalance: {
      type: Number,
      required: true,
    },
    previousOpeningType: {
      type: String,
      enum: ["dr", "cr"],
      required: true,
    },
    newOpeningBalance: {
      type: Number,
      required: true,
    },
    newOpeningType: {
      type: String,
      enum: ["dr", "cr"],
      required: true,
    },

    // Signed delta in "dr" sense (+ means more receivable)
    deltaAmount: {
      type: Number,
      required: true,
    },

    // Impact snapshot
    affectedFinancialYears: [
      {
        financialYearStart: Number, // 2025
        financialYear: String, // "2025-26"
        transactions: Number,
      },
    ],
    totalTransactions: {
      type: Number,
      default: 0,
    },
    estimatedTimeSeconds: {
      type: Number,
      default: 0,
    },

    // Execution metadata
    triggeredAt: {
      type: Date,
      default: Date.now,
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed"],
      default: "completed",
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "openingbalancehistories",
  },
);

const OpeningBalanceHistory = mongoose.model(
  "OpeningBalanceHistory",
  openingBalanceHistorySchema,
);

export default OpeningBalanceHistory;
