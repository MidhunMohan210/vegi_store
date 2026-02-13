import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { showDialog, confirmDialog, cancelDialog } from "@/store/slices/recalculationDialogSlice";

/**
 * ============================================
 * UPDATE MASTER OPENING BALANCE MUTATION
 * ============================================
 * 
 * Purpose: Update master opening balance with recalculation
 * 
 * Flow:
 * 1. Analyze impact (call /analyze endpoint)
 * 2. Show confirmation dialog with impact details (using Redux)
 * 3. If user confirms, execute update (call /update endpoint)
 * 4. Show success/error toast
 * 5. Invalidate queries to refresh UI
 * 
 * ============================================
 */
export const useUpdateMasterOpeningBalance = (companyId, branchId) => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async (payload) => {
      console.log(`\n[Mutation] Starting opening balance update process...`);
      console.log(`[Mutation] Payload:`, payload);

      const { entityType, entityId, newOpeningBalance, openingBalanceType } = payload;

      // ========================================
      // STEP 1: ANALYZE IMPACT (GET WARNING DATA)
      // ========================================
      console.log(`[Mutation] Step 1: Analyzing impact...`);

      const impactData = await openingBalanceService.analyzeImpact(
        { entityType, entityId, newOpeningBalance, openingBalanceType },
        companyId,
        branchId
      );

      console.log(`[Mutation] Impact data received:`, impactData);

      // ========================================
      // STEP 2: SHOW CONFIRMATION DIALOG (REDUX)
      // ========================================
      console.log(`[Mutation] Step 2: Showing confirmation dialog...`);

      const userConfirmed = await new Promise((resolve) => {
        // Store the resolve callback in a closure
        window.__recalculationDialogResolve = resolve;
        
        // Dispatch action to show dialog
        dispatch(showDialog({ impactData: impactData.data }));
      });

      // Clean up
      delete window.__recalculationDialogResolve;

      if (!userConfirmed) {
        console.log(`[Mutation] ❌ User cancelled operation`);
        throw new Error("USER_CANCELLED");
      }

      console.log(`[Mutation] ✅ User confirmed, proceeding with update...`);

      // ========================================
      // STEP 3: EXECUTE UPDATE WITH RECALCULATION
      // ========================================
      console.log(`[Mutation] Step 3: Executing update...`);

      const result = await openingBalanceService.updateMasterOpeningBalance(
        {
          entityType,
          entityId,
          newOpeningBalance,
          openingBalanceType,
          impactData: impactData.data, // Pass impact data from step 1
        },
        companyId,
        branchId
      );

      console.log(`[Mutation] Update result:`, result);

      return result;
    },

    onSuccess: (res, variables) => {
      console.log(`[Mutation] Success callback triggered`);
      console.log(`[Mutation] Response:`, res);

      // Show detailed success toast
      if (res.data) {
        toast.success("Opening Balance Updated", {
          description: `Successfully recalculated ${res.data.totalTransactionsUpdated} transactions across ${res.data.affectedBranches.length} branch(es) in ${res.data.executionTime}`,
          duration: 5000,
        });
      } else {
        toast.success(res.message || "Opening balance updated successfully");
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: [
          "openingBalance",
          "list",
          variables.entityType,
          variables.entityId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });

      // Invalidate account master to refresh opening balance display
      queryClient.invalidateQueries({
        queryKey: ["accountMaster"],
      });

      // Invalidate ledger queries
      queryClient.invalidateQueries({
        queryKey: ["account-ledger"],
      });
    },

    onError: (error) => {
      console.error(`[Mutation] Error callback triggered:`, error);

      // Don't show toast for user cancellation
      if (error.message === "USER_CANCELLED") {
        console.log(`[Mutation] User cancelled, no error toast`);
        return;
      }

      // Show error toast for actual errors
      toast.error("Update Failed", {
        description: error.message || "Failed to update opening balance",
        duration: 5000,
      });
    },
  });
};


/**
 * Save opening adjustment mutation (existing - unchanged)
 */
export const useSaveOpeningAdjustment = (companyId, branchId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      openingBalanceService.saveAdjustment(payload, companyId, branchId),
    onSuccess: (res, variables) => {
      toast.success(res.message || "Adjustment saved successfully");

      queryClient.invalidateQueries({
        queryKey: [
          "openingBalance",
          "list",
          variables.entityType,
          variables.entityId,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save adjustment");
    },
  });
};


/**
 * Delete opening adjustment mutation (existing - unchanged)
 */
export const useDeleteOpeningAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      openingBalanceService.cancelAdjustment(payload.adjustmentId),
    onSuccess: (res, variables) => {
      console.log(variables);
      console.log(res);
      const resData = res.data || {};

      toast.success(res.message || "Adjustment removed");

      queryClient.invalidateQueries({
        queryKey: [
          "openingBalance",
          "list",
          resData.entityType,
          resData.entityId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove adjustment");
    },
  });
};
