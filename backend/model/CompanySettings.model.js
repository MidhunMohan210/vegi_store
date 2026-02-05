// models/CompanySettings.model.js
import mongoose from "mongoose";

const CompanySettingsSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true, // 1:1 per company
    },

    financialYear: {
      currentFY: {
        type: String, // "2033-2034"
        required: true,
      },
      startDate: {
        type: Date,   // FY start date
        required: true,
      },
      endDate: {
        type: Date,   // FY end date
        required: true,
      },
      lastChangedAt: {
        type: Date,
        default: Date.now,
      },
    },

  
  },
  { timestamps: true }
);




export default mongoose.model("CompanySettings", CompanySettingsSchema);
