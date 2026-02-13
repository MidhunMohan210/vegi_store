import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { AlertTriangle, TrendingUp, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmDialog, cancelDialog, closeDialog } from "@/store/slices/recalculationDialogSlice";

/**
 * ============================================
 * RECALCULATION CONFIRMATION DIALOG
 * ============================================
 * 
 * Purpose: Show detailed warning before executing recalculation
 * - Uses Redux for state management
 * - Displays affected branches and transaction counts
 * - Shows estimated time
 * - User must confirm to proceed
 * 
 * Used by: useUpdateMasterOpeningBalance mutation
 * ============================================
 */
const RecalculationConfirmationDialog = () => {
  const dispatch = useDispatch();
  const { isOpen, impactData } = useSelector((state) => state.recalculationDialog);

  const handleConfirm = () => {
    // Call the resolve callback stored in window
    if (window.__recalculationDialogResolve) {
      window.__recalculationDialogResolve(true);
    }
    dispatch(confirmDialog());
  };

  const handleCancel = () => {
    // Call the resolve callback with false
    if (window.__recalculationDialogResolve) {
      window.__recalculationDialogResolve(false);
    }
    dispatch(cancelDialog());
  };

  const handleOpenChange = (open) => {
    if (!open) {
      handleCancel();
    }
  };

  if (!impactData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Opening Balance Recalculation Required
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Editing opening balance will trigger recalculation of ledger entries and balances
          </DialogDescription>
        </DialogHeader>

        {/* Impact Summary */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold text-amber-900">Impact Summary</span>
          </div>

          {/* Branch Breakdown */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {impactData.affectedBranches?.map((branch) => (
              <div
                key={branch.branchId}
                className="bg-white border border-amber-200 rounded-md p-3 space-y-1"
              >
                <div className="text-xs font-bold text-slate-800">
                  {branch.branchName}
                </div>
                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <div>
                    <span className="font-semibold">Years:</span>{" "}
                    {branch.yearsToRecalculate?.join(", ")}
                  </div>
                  <div>
                    <span className="font-semibold">Transactions:</span>{" "}
                    {branch.transactionCount?.toLocaleString("en-IN")}
                  </div>
                  {branch.stoppedDueToAdjustment && (
                    <div className="text-amber-700 font-medium">
                      ⚠️ Stopped at {branch.stoppedDueToAdjustment} (has adjustment)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Total Summary */}
          <div className="bg-amber-100 border border-amber-300 rounded-md p-3 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold text-amber-900">Total Transactions:</span>{" "}
              <span className="text-amber-800 font-mono">
                {impactData.totalTransactions?.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-amber-800">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-semibold">~{impactData.estimatedTime}</span>
            </div>
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-800 leading-relaxed">
            <strong>⚠️ Important:</strong> This operation will recalculate all running
            balances for affected transactions. This cannot be undone easily. Make sure
            you want to proceed.
          </p>
        </div>

        {/* Balance Change Preview */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
          <div className="text-xs">
            <span className="text-slate-600">Old Balance:</span>{" "}
            <span className="font-mono font-bold text-slate-800">
              {impactData.oldOpeningBalanceType === "dr" ? "Dr" : "Cr"} ₹
              {Math.abs(impactData.oldOpeningBalance || 0).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="text-slate-400">→</div>
          <div className="text-xs">
            <span className="text-slate-600">New Balance:</span>{" "}
            <span className="font-mono font-bold text-blue-600">
              {impactData.newOpeningBalanceType === "dr" ? "Dr" : "Cr"} ₹
              {Math.abs(impactData.newOpeningBalance || 0).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Footer Buttons */}
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-all flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            Proceed with Recalculation
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecalculationConfirmationDialog;
