// controllers/companySettings.controller.js
import Company from "../../model/masters/CompanyModel.js";
import CompanySettings from "../../model/CompanySettings.model.js";
import { computeFYDates } from "../../utils/financialYear.js";


// fallback when no company FY found
const getDefaultFYForCompany = (company) => {
  if (company?.financialYear?.currentFY) {
    // Your company.currentFY might be "2025-26" → convert to "2025-2026"
    const parts = company.financialYear.currentFY.split("-");
    if (parts.length === 2 && parts[1].length === 2) {
      const start = parseInt(parts[0], 10);
      const end = start + 1;
      return `${start}-${end}`;
    }
    return company.financialYear.currentFY; // assume already "YYYY-YYYY"
  }

  const now = new Date();
  const year = now.getFullYear();
  const next = year + 1;
  return `${year}-${next}`;
};

// GET /company-settings/:companyId
export const getCompanySettings = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    let settings = await CompanySettings.findOne({ company: companyId }).lean();

    if (!settings) {
      const company = await Company.findById(companyId).lean();
      if (!company) {
        return res.status(404).json({
          success: false,
          message: "Company not found",
        });
      }

      const fyFormat = company.financialYear?.format || "april-march";
      const currentFY = getDefaultFYForCompany(company);
      const { startDate, endDate } = computeFYDates(currentFY, fyFormat);

      const created = await CompanySettings.create({
        company: companyId,
        financialYear: {
          currentFY,
          startDate,
          endDate,
          lastChangedAt: new Date(),
        },
      });

      settings = created.toObject();
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error getting company settings:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get company settings",
    });
  }
};

// PUT /company-settings/:companyId/financial-year
export const updateCompanyFinancialYear = async (req, res) => {
  try {
    // throw new Error("Test error");
    const { companyId } = req.params;
    const { financialYear } = req.body; // { currentFY: "2033-2034" } OR {currentFY}
    const currentFY = financialYear?.currentFY || req.body.currentFY;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId is required",
      });
    }

    if (!currentFY || !/^\d{4}-\d{4}$/.test(currentFY)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing currentFY. Expected YYYY-YYYY (e.g. 2033-2034)",
      });
    }

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const fyFormat = company.financialYear?.format || "april-march";
    const { startDate, endDate } = computeFYDates(currentFY, fyFormat);

    const updated = await CompanySettings.findOneAndUpdate(
      { company: companyId },
      {
        company: companyId,
        financialYear: {
          currentFY,
          startDate,
          endDate,
          lastChangedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Financial year updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating financial year:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update financial year",
    });
  }
};
