// api/services/openingBalance.service.ts
import axios from "axios";
import { api } from "../client/apiClient";

export const openingBalanceService = {
  // Get year-wise balances
  getYearWiseBalances: async (entityType, entityId, companyId, branchId,    page = 1) => {
    try {
      const res = await api.get(
        `/opening-balance/${entityType}/${entityId}/years`,
        {
          params: { companyId, branchId, page }
        }
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error fetching opening balances");
    }
  },

  // Save/Update Adjustment
  saveAdjustment: async (payload) => {
    try {
      const res = await api.post("/opening-balance/adjust", payload);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error saving adjustment");
    }
  },

  // Cancel Adjustment (Optional/Future)
  cancelAdjustment: async (adjustmentId) => {
    try {
      const res = await api.delete(`/opening-balance/adjust/${adjustmentId}`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error cancelling adjustment");
    }
  }
};
