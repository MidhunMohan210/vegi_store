// api/services/companySettings.service.ts
import axios from "axios";
import { api } from "../client/apiClient";

export const companySettingsService = {
  get: async (companyId) => {
    try {
      const res = await api.get(`/settings/company-settings/${companyId}`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error fetching company settings");
    }
  },

  updateFinancialYear: async (companyId, currentFY) => {
    try {
      const res = await api.put(`/settings/company-settings/financial-year/${companyId}`, {
        financialYear: { currentFY },
      });
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error updating financial year");
    }
  },
};
