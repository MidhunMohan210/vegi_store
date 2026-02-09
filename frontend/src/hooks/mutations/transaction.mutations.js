// hooks/mutations/transactionMutations.js
import { toast } from "sonner";
import { transactionServices } from "../../api/services/transaction.service";
import { capitalizeFirstLetter } from "../../../../shared/utils/string";

export const transactionMutations = {
  create: (queryClient) => ({
    mutationFn: ({ formData, transactionType }) =>
      transactionServices.create(formData, transactionType),

    onSuccess: (response, variables) => {
      // The response structure is { success, message, data: { transaction, ... } }
      const { company, branch, transactionType, _id } =
        response?.data?.transaction;
      queryClient.invalidateQueries({
        queryKey: ["transactions", transactionType, "", company, branch],
      });

      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });

      queryClient.invalidateQueries({
        queryKey: ["items"],

      });
      queryClient.invalidateQueries({
        queryKey: ["openingBalance"],

      });

      toast.success(
        `${capitalizeFirstLetter(
          response?.data?.transaction?.transactionType || "Transaction",
        )} created successfully!`,
      );
    },

    onError: (error) => {
      console.error("Transaction creation failed:", error);
      toast.error(
        error.message || "Error creating transaction. Please try again.",
      );
    },
  }),

  update: (queryClient) => ({
    mutationFn: ({ id, formData, transactionType }) =>
      transactionServices.update(id, formData, transactionType),

    onSuccess: (response, variables) => {
      const { company, branch, transactionType, _id } =
        response?.data?.transaction;

      queryClient.invalidateQueries({
        queryKey: [
          "transactions",
          "getById",
          company,
          branch,
          _id,
          transactionType,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["transactions", transactionType, "", company, branch],
      });

      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });

      queryClient.invalidateQueries({
        queryKey: ["items"],

      });

      queryClient.invalidateQueries({
        queryKey: ["openingBalance"],

      });

      toast.success(
        `${capitalizeFirstLetter(
          response?.data?.transaction?.transactionType || "Transaction",
        )} updated successfully!`,
      );

      // Also invalidate the specific transaction query
      queryClient.invalidateQueries({
        queryKey: ["transaction", variables.id],
      });
    },

    onError: (error) => {
      console.error("Transaction update failed:", error);
      toast.error(
        error.message || "Error updating transaction. Please try again.",
      );
    },
  }),

  delete: (queryClient) => ({
    mutationFn: ({ id, transactionType, company, branch, reason }) =>
      transactionServices.delete(id, transactionType, company, branch, reason),

    onSuccess: (response, variables) => {
      const { id, transactionType, company, branch } = variables;

      // Invalidate the specific transaction query
      queryClient.invalidateQueries({
        queryKey: [
          "transactions",
          "getById",
          company,
          branch,
          id,
          transactionType,
        ],
      });

      // Invalidate the transactions list
      queryClient.invalidateQueries({
        queryKey: ["transactions", transactionType, "", company, branch],
      });

      // Invalidate all transaction lists for this company/branch
      queryClient.invalidateQueries({
        queryKey: ["transactions"],
      });

      // Invalidate reports
      queryClient.invalidateQueries({
        queryKey: ["reports"],
      });

      // Invalidate items with full refetch
      queryClient.invalidateQueries({
        queryKey: ["items"],
   
      });

      queryClient.invalidateQueries({
        queryKey: ["openingBalance"],
   
      });

      // Don't show toast here - let the component handle it for better UX control
    },

    onError: (error) => {
      console.error("Transaction deletion failed:", error);
      // Don't show toast here - let the component handle it
      throw error; // Re-throw to be caught by component
    },
  }),
};
