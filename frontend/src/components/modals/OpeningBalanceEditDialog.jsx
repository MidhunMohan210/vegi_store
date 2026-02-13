// components/modals/OpeningBalanceEditDialog.jsx
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { AlertTriangle, Loader2, Calculator, TrendingUp, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { openingBalanceQueries } from "@/hooks/queries/openingBalance.queries";
import { useUpdateMasterOpeningBalance } from "@/hooks/mutations/openingBalance.mutation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const OpeningBalanceEditDialog = ({
  open,
  onOpenChange,
  currentBalance = 0,
  currentBalanceType = "dr",
  accountName = "Account",
  entityType = "party",
  entityId,
  companyId,
  branchId,
  onUpdated,
}) => {
  // // Fetch recalculation impact data
  // const {
  //   data: impactData,
  //   isLoading: isLoadingImpact,
  //   isError: isErrorImpact,
  //   error: impactError,
  //   refetch: refetchImpact,
  // } = useQuery({
  //   ...openingBalanceQueries.recalculationImpact(
  //     entityType,
  //     entityId,
  //     companyId,
  //     branchId
  //   ),
  //   enabled: open && !!entityId && !!companyId,
  // });

  // Update master opening balance mutation
  const updateOpeningBalanceMutation = useUpdateMasterOpeningBalance(companyId, branchId);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      newOpeningBalance: currentBalance,
      openingBalanceType: currentBalanceType,
    },
  });

  // Reset form when dialog opens with current values
  useEffect(() => {
    if (open) {
      reset({
        newOpeningBalance: currentBalance,
        openingBalanceType: currentBalanceType,
      });
    }
  }, [open, currentBalance, currentBalanceType, reset]);

  const newBalance = watch("newOpeningBalance");
  const newBalanceType = watch("openingBalanceType");

  const onSubmit = (formData) => {

    /// if new balance is same as current balance then return
    if (newBalance === currentBalance && newBalanceType === currentBalanceType) {
      toast.error("No changes detected. Please make a new adjustment.");
      return;
    }

    // Prepare payload for API
    const payload = {
      entityType,
      entityId,
      newOpeningBalance: formData.newOpeningBalance,
      openingBalanceType: formData.openingBalanceType,
    };

    // Call the mutation
    updateOpeningBalanceMutation.mutate(payload, {
      onSuccess: () => {
        // Call the callback with new values
        if (onUpdated) {
          onUpdated({
            newOpeningBalance: formData.newOpeningBalance,
            openingBalanceType: formData.openingBalanceType,
          });
        }

        // Close the dialog
        onOpenChange(false);
      },
    });
  };

  const inputClass =
    "w-full text-sm border border-slate-300 rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            Edit Master Opening Balance
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Update the opening balance for{" "}
            <span className="font-semibold text-slate-700">{accountName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Warning Card with Recalculation Info */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h4 className="text-xs font-bold text-amber-900">
                  Recalculation Required
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Changing the opening balance will trigger recalculation of all
                  subsequent transactions and balances.
                </p>
              </div>
            </div>

          </div>

          {/* Current Opening Balance Display */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Current Opening Balance
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white border border-slate-200 rounded-md px-3 py-2.5">
                <span className="text-sm font-mono font-bold text-slate-700">
                  ₹ {Math.abs(currentBalance).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-md px-3 py-2.5 min-w-[100px]">
                <span
                  className={`text-sm font-bold ${
                    currentBalanceType === "dr"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {currentBalanceType === "dr" ? "Dr (Rec)" : "Cr (Pay)"}
                </span>
              </div>
            </div>
          </div>

          {/* New Opening Balance Input */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                New Opening Balance Amount{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                {...register("newOpeningBalance", {
                  required: "Opening balance is required",
                  valueAsNumber: true,
                  min: {
                    value: 0,
                    message: "Balance cannot be negative",
                  },
                })}
                type="number"
                step="0.01"
                className={`${inputClass} font-mono`}
                placeholder="0.00"
                disabled={updateOpeningBalanceMutation.isPending}
              />
              {errors.newOpeningBalance && (
                <p className="text-xs text-red-500 font-medium">
                  {errors.newOpeningBalance.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Balance Type <span className="text-red-500">*</span>
              </label>
              <select
                {...register("openingBalanceType", {
                  required: "Balance type is required",
                })}
                className={inputClass}
                disabled={updateOpeningBalanceMutation.isPending}
              >
                <option value="dr">Debit (Receivable)</option>
                <option value="cr">Credit (Payable)</option>
              </select>
              {errors.openingBalanceType && (
                <p className="text-xs text-red-500 font-medium">
                  {errors.openingBalanceType.message}
                </p>
              )}
            </div>
          </div>

          {/* Preview of Changes
          {(newBalance !== currentBalance ||
            newBalanceType !== currentBalanceType) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-900 mb-2">
                📊 Preview Changes
              </div>
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-blue-600">Old:</span>{" "}
                  <span className="font-mono font-bold text-blue-900">
                    {currentBalanceType === "dr" ? "Dr" : "Cr"} ₹
                    {Math.abs(currentBalance).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="text-blue-400">→</div>
                <div>
                  <span className="text-blue-600">New:</span>{" "}
                  <span className="font-mono font-bold text-blue-900">
                    {newBalanceType === "dr" ? "Dr" : "Cr"} ₹
                    {Math.abs(newBalance || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          )} */}

          {/* Footer Buttons */}
          <DialogFooter className="gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={updateOpeningBalanceMutation.isPending}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateOpeningBalanceMutation.isPending}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 min-w-[160px] justify-center"
            >
              {updateOpeningBalanceMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recalculating...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4" />
                  Save & Recalculate
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OpeningBalanceEditDialog;
