// middleware/checkFYRange.js

import CompanySettingsModel from "../model/CompanySettings.model.js";


export const checkFYRange = (getDateField = "date") => {
  return async (req, res, next) => {
    try {
      const companyId = req.body.company || req.params.companyId;
      const txnDate = req.body[getDateField];

      if (!companyId || !txnDate) {
        return next(); // or throw if mandatory
      }

      const settings = await CompanySettingsModel.findOne({ company: companyId })
        .select("financialYear")
        .lean();

      if (!settings?.financialYear) return next();

      const { startDate, endDate } = settings.financialYear;
      if (!startDate || !endDate) return next();

      const d = new Date(txnDate);

      console.log(startDate,endDate,d);
      

      if (d < new Date(startDate) || d > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          message: "Transaction date is outside the current financial year.",
        });
      }

      next();
    } catch (error) {
      console.error("FY middleware error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to validate financial year range.",
      });
    }
  };
};
