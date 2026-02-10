// models/Company.model.js
import mongoose from "mongoose";

export const CompanySchema = new mongoose.Schema(
  {
    // Basic Company Info
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      minlength: [2, "Minimum 2 characters required"],
      maxlength: [100, "Maximum 100 characters allowed"],
      trim: true,
    },
    companyType: {
      type: String,
      enum: [
        "Private Limited",
        "Public Limited",
        "LLP",
        "Partnership",
        "Sole Proprietorship",
        "Other",
      ],
      default: "Private Limited",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Suspended"],
      default: "Active",
    },

    // Contact Details
    permanentAddress: {
      type: String,
      required: [true, "Permanent address is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email address",
      ],
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      match: [
        /^[6-9]\d{9}$/,
        "Mobile number must be valid 10-digit Indian number",
      ],
    },

    // Registration Details
    gstNumber: {
      type: String,
      sparse: true,
      uppercase: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        "Invalid GST format",
      ],
    },
    panNumber: {
      type: String,
      sparse: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format"],
    },

    // Financial Year Configuration
    financialYear: {
      format: {
        type: String,
        enum: [
          "april-march",
          "january-december",
          "february-january",
          "march-february",
          "may-april",
          "june-may",
          "july-june",
          "august-july",
          "september-august",
        ],
        default: "april-march",
      },
      startingYear: {
        type: Number,
        min: 1900,
        max: 2999,
      },
      startMonth: {
        type: Number, // 1-12 (1=Jan, 4=April, etc.)
        min: 1,
        max: 12,
      },
      endMonth: {
        type: Number, // 1-12
        min: 1,
        max: 12,
      },
      // currentFY: {
      //   type: String, // e.g., "2025-26"
      // },
      // fyStartDate: {
      //   type: Date, // e.g., 2025-04-01
      // },
      // fyEndDate: {
      //   type: Date, // e.g., 2026-03-31
      // },

      // Lock Settings
      lockSettings: {
        enabled: {
          type: Boolean,
          default: true,
        },
        lockDate: {
          type: Date,
          default: null,
        },
        normalUserEditMonths: {
          type: Number,
          default: 3,
          min: 0,
          max: 12,
        },
        adminEditYears: {
          type: Number,
          default: 2,
          min: 1,
          max: 10,
        },
        allowAdminOverride: {
          type: Boolean,
          default: true,
        },
      },

      // Year-End Tracking
      lastYearEndClosed: {
        type: Date,
        default: null,
      },
      lastAuditCompleted: {
        type: Date,
        default: null,
      },

      // 🔒 FY FORMAT LOCK
      formatLocked: {
        type: Boolean,
        default: false,
      },
      formatLockedAt: {
        type: Date,
        default: null,
      },
      formatLockedReason: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

// // Index for faster queries
// CompanySchema.index({ email: 1 });
// CompanySchema.index({ gstNumber: 1 });
// CompanySchema.index({ status: 1 });

// ✅ Helper function to get current FY based on format and current date
function getCurrentFinancialYear(startMonth) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  let fyStartYear, fyEndYear;

  if (currentMonth >= startMonth) {
    fyStartYear = currentYear;
    fyEndYear = currentYear + 1;
  } else {
    fyStartYear = currentYear - 1;
    fyEndYear = currentYear;
  }

  return {
    fyStartYear,
    fyEndYear,
    fyString: `${fyStartYear}-${fyEndYear.toString().slice(-2)}`,
  };
}

// Pre-save hook to calculate FY details from format
CompanySchema.pre("save", function (next) {
  // Always ensure financialYear object exists
  if (!this.financialYear) {
    this.financialYear = {};
  }

  // Set default format if not provided
  if (!this.financialYear.format) {
    this.financialYear.format = "april-march";
  }

  const fyFormatMap = {
    "april-march": { start: 4, end: 3 },
    "january-december": { start: 1, end: 12 },
    "february-january": { start: 2, end: 1 },
    "march-february": { start: 3, end: 2 },
    "may-april": { start: 5, end: 4 },
    "june-may": { start: 6, end: 5 },
    "july-june": { start: 7, end: 6 },
    "august-july": { start: 8, end: 7 },
    "september-august": { start: 9, end: 8 },
  };

  const format = this.financialYear.format;
  const fyConfig = fyFormatMap[format];

  if (fyConfig) {
    // Always set start and end months
    this.financialYear.startMonth = fyConfig.start;
    this.financialYear.endMonth = fyConfig.end;

    let fyStartYear, fyEndYear;

    // If currentFY is manually set, parse it
    if (
      this.isModified("financialYear.currentFY") &&
      this.financialYear.currentFY
    ) {
      const fyParts = this.financialYear.currentFY.split("-");
      fyStartYear = parseInt(fyParts[0]);
      fyEndYear = parseInt("20" + fyParts[1]);
    } else {
      // Auto-calculate based on current date
      const currentFY = getCurrentFinancialYear(fyConfig.start);
      fyStartYear = currentFY.fyStartYear;
      fyEndYear = currentFY.fyEndYear;
      this.financialYear.currentFY = currentFY.fyString;
    }

    // ✅ FIX: Create dates in UTC to avoid timezone issues
    // Start date: First day of start month at 00:00:00 UTC
    this.financialYear.fyStartDate = new Date(
      Date.UTC(fyStartYear, fyConfig.start - 1, 1, 0, 0, 0),
    );

    // End date: Last day of end month at 23:59:59.999 UTC
    // Get last day by going to next month day 0
    const lastDay = new Date(Date.UTC(fyEndYear, fyConfig.end, 0)).getUTCDate();
    this.financialYear.fyEndDate = new Date(
      Date.UTC(fyEndYear, fyConfig.end - 1, lastDay, 23, 59, 59, 999),
    );
  }

  next();
});

// Method to check if FY FORMAT can be changed
CompanySchema.methods.canChangeFYFormat = function () {
  return !this.financialYear.formatLocked;
};

// Method to lock FY FORMAT
CompanySchema.methods.lockFYFormat = function () {
  if (!this.financialYear.formatLocked) {
    this.financialYear.formatLocked = true;
    this.financialYear.formatLockedAt = new Date();
    this.financialYear.formatLockedReason = "First transaction created";
  }
};

// Method to update FY year
CompanySchema.methods.updateFYYear = function (newFYString) {
  if (!/^\d{4}-\d{2}$/.test(newFYString)) {
    throw new Error(
      "Invalid FY format. Expected format: YYYY-YY (e.g., 2026-27)",
    );
  }

  this.financialYear.currentFY = newFYString;
  // Pre-save hook will recalculate dates
};

export default CompanySchema;
