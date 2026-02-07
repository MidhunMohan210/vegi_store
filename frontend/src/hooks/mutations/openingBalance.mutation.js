// hooks/mutations/openingBalance.mutation.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { openingBalanceService } from "@/api/services/openingBalance.service";
import { toast } from "sonner";

export const useSaveOpeningAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => openingBalanceService.saveAdjustment(payload),
    onSuccess: (res, variables) => {
      toast.success(res.message || "Adjustment saved successfully");

      // Invalidate the list query to refresh the table
      queryClient.invalidateQueries({
        queryKey: ["openingBalance", "list", variables.entityType, variables.entityId]
      });
      
      // Optionally invalidate account/item details if needed
      // queryClient.invalidateQueries(["accountMaster", "detail", variables.entityId]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save adjustment");
    }
  });
};
