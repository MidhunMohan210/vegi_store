// hooks/mutations/openingBalance.mutation.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";
import { toast } from "sonner";

export const useUpdateMasterOpeningBalance = (companyId, branchId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      openingBalanceService.updateMasterOpeningBalance(
        payload,
        companyId,
        branchId,
      ),
    onSuccess: (res, variables) => {
      toast.success(res.message || "Opening balance updated successfully");

      // Invalidate the list query to refresh the table
      queryClient.invalidateQueries({
        queryKey: [
          "openingBalance",
          "list",
          variables.entityType,
          variables.entityId,
        ],
      });

      // Invalidate recalculation impact query
      queryClient.invalidateQueries({
        queryKey: [
          "openingBalance",
          "recalculationImpact",
          variables.entityType,
          variables.entityId,
        ],
      });

      // Invalidate reports
      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update opening balance");
    },
  });
};

export const useSaveOpeningAdjustment = (companyId, branchId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) =>
      openingBalanceService.saveAdjustment(payload, companyId, branchId),
    onSuccess: (res, variables) => {
      toast.success(res.message || "Adjustment saved successfully");

      // Invalidate the list query to refresh the table
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

      // Optionally invalidate account/item details if needed
      // queryClient.invalidateQueries(["accountMaster", "detail", variables.entityId]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save adjustment");
    },
  });
};

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
