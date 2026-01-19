import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionMutations } from "../../../hooks/mutations/transaction.mutations";
import { useDispatch, useSelector } from "react-redux";
import { convertStringNumbersToNumbers } from "../utils/transactionUtils";
import { toast } from "sonner";
import { removeTransactionDataFromStore } from "@/store/slices/transactionSlice";

export const useTransactionActions = (transactionData, isEditMode = false) => {
  const queryClient = useQueryClient();
  const company = useSelector(
    (state) => state.companyBranch?.selectedCompany?._id
  );
  const branch = useSelector(
    (state) => state.companyBranch?.selectedBranch?._id
  );

  const dispatch = useDispatch();

  // Initialize both mutations
  const createMutation = useMutation(transactionMutations.create(queryClient));
  const updateMutation = useMutation(transactionMutations.update(queryClient));

  const handleSave = useCallback(async () => {
    try {
      if (transactionData.transactionType == "") {
        toast.error("Having some issue with transaction type");
        return false;
      }

      const convertedTransactionData =
        convertStringNumbersToNumbers(transactionData);

        console.log(transactionData);
        

      /// while creating the transaction ,if use added the paid amount we are creating receipt automatically ,so for receipt we need to attach previousBalanceAmount

      // Choose mutation based on mode
      if (isEditMode) {
        // Update existing transaction
        await updateMutation
          .mutateAsync({
            id: transactionData._id,
            formData: transactionData,
            transactionType: transactionData.transactionType,
          });
         queryClient.invalidateQueries({ queryKey: ['items'] });
        
        dispatch(removeTransactionDataFromStore());
      } else {
        // Create new transaction
        await createMutation.mutateAsync({
          formData: { ...convertedTransactionData, company, branch },
          transactionType: transactionData.transactionType,
        });
           queryClient.invalidateQueries({ queryKey: ['items'] });
      }

      return true;
    } catch (error) {
      console.error("Error saving transaction:", error);
      return false;
    }
  }, [transactionData, isEditMode, createMutation, updateMutation]);

  return {
    handleSave,
    isLoading: createMutation.isPending || updateMutation.isPending,
    isSuccess: createMutation.isSuccess || updateMutation.isSuccess,
    isError: createMutation.isError || updateMutation.isError,
    error: createMutation.error || updateMutation.error,
  };
};
