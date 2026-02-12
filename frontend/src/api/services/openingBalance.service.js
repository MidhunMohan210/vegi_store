// api/services/openingBalance.service.ts
import axios from "axios";
import { api } from "../client/apiClient";

export const openingBalanceService = {
  // Get year-wise balances
  getYearWiseBalances: async (
    entityType,
    entityId,
    companyId,
    branchId,
    page = 1,
  ) => {
    try {
      const res = await api.get(
        `/opening-balance/${entityType}/${entityId}/years`,
        {
          params: { companyId, branchId, page },
        },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error fetching opening balances");
    }
  },

  // Update Master Opening Balance (triggers recalculation)
  updateMasterOpeningBalance: async (payload, companyId, branchId) => {
    try {
      const res = await api.put("/opening-balance/update", payload, {
        params: { companyId, branchId },
      });
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error updating opening balance");
    }
  },

  // Save/Update Adjustment
  saveAdjustment: async (payload, companyId, branchId) => {
    try {
      const res = await api.post("/opening-balance/adjust", payload, {
        params: { companyId, branchId },
      });
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
    console.log(adjustmentId);

    try {
      const res = await api.delete(`/opening-balance/adjust/${adjustmentId}`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error cancelling adjustment");
    }
  },

  // Get recalculation impact summary
  getRecalculationImpact: async (entityType, entityId, companyId, branchId) => {
    try {
      const res = await api.get(
        `/opening-balance/${entityType}/${entityId}/recalculation-impact`,
        {
          params: { companyId, branchId },
        },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error fetching recalculation impact");
    }
  },
};
