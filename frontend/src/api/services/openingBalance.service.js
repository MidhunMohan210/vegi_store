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

  /**
   * ============================================
   * ANALYZE IMPACT (NEW)
   * ============================================
   * 
   * Purpose: Analyze the impact of changing opening balance
   * Calls /analyze endpoint to get warning data
   * 
   * @param payload - { entityType, entityId, newOpeningBalance, openingBalanceType }
   * @param companyId - Company ID
   * @param branchId - Branch ID
   * @returns Impact analysis data
   */
  analyzeImpact: async (payload, companyId, branchId) => {
    console.log(`[Service] Analyzing impact...`);
    console.log(`[Service] Payload:`, payload);

    try {
      const res = await api.post("/opening-balance/analyze", payload, {
        params: { companyId, branchId },
      });

      console.log(`[Service] Analyze response:`, res.data);

      // Check for errors
      if (!res.data.success) {
        throw new Error(res.data.message || "Failed to analyze impact");
      }

      return res.data;
    } catch (error) {
      console.error(`[Service] Error analyzing impact:`, error);
      
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw new Error("Error analyzing impact");
    }
  },

  /**
   * ============================================
   * UPDATE MASTER OPENING BALANCE (UPDATED)
   * ============================================
   * 
   * Purpose: Execute opening balance update with recalculation
   * Calls /update endpoint after user confirmation
   * 
   * @param payload - { entityType, entityId, newOpeningBalance, openingBalanceType, impactData }
   * @param companyId - Company ID
   * @param branchId - Branch ID
   * @returns Update result
   */
  updateMasterOpeningBalance: async (payload, companyId, branchId) => {
    console.log(`[Service] Updating master opening balance...`);
    console.log(`[Service] Payload:`, payload);

    try {
      const res = await api.post("/opening-balance/update", payload, {
        params: { companyId, branchId },
      });

      console.log(`[Service] Update response:`, res.data);

      // Check for errors
      if (!res.data.success) {
        throw new Error(res.data.message || "Failed to update opening balance");
      }

      return res.data;
    } catch (error) {
      console.error(`[Service] Error updating opening balance:`, error);
      
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

  // Cancel Adjustment
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

  // Get recalculation impact summary (OLD - Can be removed if not used elsewhere)
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
