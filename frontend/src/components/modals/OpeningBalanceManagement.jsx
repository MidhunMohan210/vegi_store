// components/OpeningBalanceManagement.jsx
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Lock,
  Edit,
  AlertCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { openingBalanceQueries } from "@/hooks/queries/openingBalance.queries";
import {
  useSaveOpeningAdjustment,
  useDeleteOpeningAdjustment,
} from "@/hooks/mutations/openingBalance.mutation";
import { useSelector } from "react-redux";

const OpeningBalanceManagement = ({
  open,
  onOpenChange,
  entityType, // "party" | "item"
  entityId,
  entityName,
}) => {
  const [page, setPage] = useState(1);
  const [editingYear, setEditingYear] = useState(null);
  const [editingYearHasAdjustment, setEditingYearHasAdjustment] =
    useState(false);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    desiredOpening: "",
    reason: "",
  });

  const companyId = useSelector(
    (state) => state.companyBranch?.selectedCompany?._id,
  );
  const branchId = useSelector(
    (state) => state.companyBranch?.selectedBranch?._id,
  );

  const {
    data: responseData,
    isLoading,
    isError,
    refetch,
  } = useQuery(
    openingBalanceQueries.list(entityType, entityId, companyId, branchId, page),
  );

  const fullData = responseData?.data || [];
  const pagination = responseData?.pagination || {
    page: 1,
    pageSize: 5,
    totalYears: 0,
    totalPages: 1,
  };

  const currentPage = pagination.page;
  const totalPages = pagination.totalPages;

  const { mutate: saveAdjustment, isPending: isSaving } =
    useSaveOpeningAdjustment(companyId, branchId);
  const { mutate: deleteAdjustment, isPending: isDeleting } =
    useDeleteOpeningAdjustment();

  const handleEditAdjustment = (year) => {
    setEditingYear(year);

    console.log(fullData);

    const yearInfo = fullData.find((y) => y.financialYear === year);
    if (!yearInfo) return;

    const currentValue =
      entityType === "item"
        ? (yearInfo.effectiveQuantity ?? yearInfo.openingQuantity)
        : (yearInfo.effectiveOpening ?? yearInfo.openingBalance);

    setAdjustmentForm({
      desiredOpening: currentValue ?? "",
      reason: yearInfo.adjustment ? "Update adjustment" : "",
    });
    setEditingYearHasAdjustment(!!yearInfo.adjustment);
    setEditingAdjustmentId(yearInfo.adjustmentId || null);
  };

  const resetEditState = () => {
    setEditingYear(null);
    setEditingAdjustmentId(null);
    setEditingYearHasAdjustment(false);
    setAdjustmentForm({ desiredOpening: "", reason: "" });
  };

  const handleSaveAdjustment = () => {
    const yearInfo = fullData.find((y) => y.financialYear === editingYear);
    if (!yearInfo) return;

    if (!adjustmentForm.desiredOpening || !adjustmentForm.reason) {
      toast.error("Please fill all fields");
      return;
    }

    /// check if no change in the amount then do not proceed

    const originalBase =
      entityType === "party"
        ? yearInfo.openingBalance
        : yearInfo.openingQuantity;
    const desired = parseFloat(adjustmentForm.desiredOpening);

    if (originalBase === desired) {
      toast.error("No change in opening balance");
      return;
    }

    let adjustmentAmount = 0;

    if (entityType === "party") {
      const originalBase = yearInfo.openingBalance || 0;
      const desired = parseFloat(adjustmentForm.desiredOpening);
      adjustmentAmount = desired - originalBase;
    } else {
      const originalBase = yearInfo.openingQuantity || 0;
      const desired = parseFloat(adjustmentForm.desiredOpening);
      adjustmentAmount = desired - originalBase;
    }

    saveAdjustment(
      {
        entityId,
        entityType,
        financialYear: editingYear,
        adjustmentAmount,
        reason: adjustmentForm.reason,
        companyId,
        branchId,
      },
      {
        onSuccess: () => {
          resetEditState();
        },
      },
    );
  };

  const handleDeleteAdjustment = () => {
    console.log("editingAdjustmentId", editingAdjustmentId);

    if (!editingAdjustmentId) return;

    deleteAdjustment(
      { adjustmentId: editingAdjustmentId },
      {
        onSuccess: () => {
          resetEditState();
        },
      },
    );
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount || 0);

  const formatNumber = (num) => new Intl.NumberFormat("en-IN").format(num || 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-7xl w-[90vw] h-[70vh] p-0 overflow-hidden flex flex-col bg-white dark:bg-zinc-950 dark:border-zinc-800">
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0 bg-slate-50 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold truncate text-slate-900 dark:text-zinc-50">
                  {entityName} - Opening Balance Management
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5 text-slate-500 dark:text-zinc-400">
                  Year-wise opening balances with adjustments
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6 bg-white dark:bg-zinc-950 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-zinc-950/50 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            )}

            {isError && (
              <div className="flex flex-col items-center justify-center  h-full">
                <Button
                  variant="outline"
                  className="mx-auto  bg-blue-600 text-white hover:bg-blue-700 hover:text-white cursor-pointer"
                  onClick={() => refetch()}
                >
                  Retry
                </Button>
                <div className="text-center text-gray-500 mt-2 text-sm">
                  Failed to load opening balances. Please try again.
                </div>
              </div>
            )}

            {!isLoading && !isError && entityType === "party" && (
              <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-slate-50 dark:bg-zinc-900/50 border-b border-slate-200 dark:border-zinc-800">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          FY
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Source
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Carried Forward
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Adjustment
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Effective Opening
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Closing Balance
                        </th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-950 divide-y divide-slate-200 dark:divide-zinc-800">
                      {fullData.map((year) => (
                        <tr
                          key={year.financialYear}
                          className={`${
                            year.isCurrent
                              ? "bg-blue-50/50 dark:bg-blue-900/10"
                              : ""
                          } hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 whitespace-nowrap">
                                {year.financialYear}
                              </span>
                              {year.isCurrent && (
                                <Badge className="text-[9px] px-1.5 py-0 bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 whitespace-nowrap">
                                  CURRENT
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                              {year.source === "master" ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                                  Master
                                </>
                              ) : (
                                <>
                                  <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                                  Carry Fwd
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-medium text-slate-900 dark:text-zinc-200">
                              {formatCurrency(year.openingBalance)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {year.adjustment ? (
                              <span
                                className={`text-sm font-bold ${
                                  year.adjustment > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {year.adjustment > 0 ? "+" : ""}
                                {formatCurrency(year.adjustment)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              {formatCurrency(year.effectiveOpening)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {year.closingBalance != null ? (
                              <span className="text-sm text-slate-700 dark:text-zinc-300">
                                {formatCurrency(year.closingBalance)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              {year.source !== "master" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-3 text-xs dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                  onClick={() =>
                                    handleEditAdjustment(year.financialYear)
                                  }
                                >
                                  <Edit className="w-3.5 h-3.5 mr-1.5" />
                                  Edit
                                </Button>
                              ) : (
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-zinc-600">
                                  <Lock className="w-3.5 h-3.5" />
                                  Locked
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!isLoading && !isError && entityType === "item" && (
              <div className="border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px]">
                    <thead className="bg-slate-50 dark:bg-zinc-900/50 border-b border-slate-200 dark:border-zinc-800">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          FY
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Source
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Opening Qty
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Opening Value
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Adj Qty
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Adj Value
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Effective Qty
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Effective Value
                        </th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-zinc-950 divide-y divide-slate-200 dark:divide-zinc-800">
                      {fullData.map((year) => (
                        <tr
                          key={year.financialYear}
                          className={`hover:bg-slate-50 dark:hover:bg-zinc-900/50 ${
                            year.isCurrent
                              ? "bg-blue-50/50 dark:bg-blue-900/10"
                              : ""
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-sm text-slate-900 dark:text-zinc-100">
                            {year.financialYear}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-zinc-400">
                            {year.source}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-slate-900 dark:text-zinc-200">
                            {formatNumber(year.openingQuantity)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-slate-900 dark:text-zinc-200">
                            {formatCurrency(year.openingValue)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm">
                            {year.adjustmentQuantity ? (
                              <span
                                className={`${
                                  year.adjustmentQuantity > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                } font-bold`}
                              >
                                {year.adjustmentQuantity > 0 ? "+" : ""}
                                {formatNumber(year.adjustmentQuantity)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-sm">
                            {year.adjustmentValue ? (
                              <span
                                className={`${
                                  year.adjustmentValue > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                } font-bold`}
                              >
                                {year.adjustmentValue > 0 ? "+" : ""}
                                {formatCurrency(year.adjustmentValue)}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-zinc-600">
                                —
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-bold text-blue-600 dark:text-blue-400">
                            {formatNumber(year.effectiveQuantity)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-bold text-blue-600 dark:text-blue-400">
                            {formatCurrency(year.effectiveValue)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!year.isLocked ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                onClick={() =>
                                  handleEditAdjustment(year.financialYear)
                                }
                              >
                                Edit
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-zinc-600 flex items-center justify-center gap-1">
                                <Lock className="w-3 h-3" /> Locked
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-zinc-800 p-4 bg-slate-50 dark:bg-zinc-900 flex items-center justify-between">
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              Showing{" "}
              <span className="font-medium text-slate-900 dark:text-zinc-200">
                {fullData.length
                  ? (pagination.page - 1) * pagination.pageSize + 1
                  : 0}
              </span>{" "}
              to{" "}
              <span className="font-medium text-slate-900 dark:text-zinc-200">
                {(pagination.page - 1) * pagination.pageSize + fullData.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-slate-900 dark:text-zinc-200">
                {pagination.totalYears}
              </span>{" "}
              entries
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-xs font-medium px-2 dark:text-zinc-300">
                Page {currentPage} of {totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Adjustment Modal */}
      <Dialog open={editingYear !== null} onOpenChange={() => resetEditState()}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="dark:text-zinc-50">
              Edit Adjustment - FY {editingYear}
            </DialogTitle>
            <DialogDescription className="dark:text-zinc-400">
              Modify the opening balance for this year.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-zinc-300">
                Desired Opening Balance
              </Label>
              <Input
                type="number"
                value={adjustmentForm.desiredOpening}
                onChange={(e) =>
                  setAdjustmentForm({
                    ...adjustmentForm,
                    desiredOpening: e.target.value,
                  })
                }
                className="dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
              />
              <p className="text-[10px] text-slate-500">
                System will automatically calculate the adjustment amount.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="dark:text-zinc-300">Reason</Label>
              <Textarea
                value={adjustmentForm.reason}
                onChange={(e) =>
                  setAdjustmentForm({
                    ...adjustmentForm,
                    reason: e.target.value,
                  })
                }
                className="dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 resize-none"
                placeholder="e.g., Physical count variance"
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-md p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-400">
                <p className="font-semibold mb-1">Impact Analysis:</p>
                <p>
                  This will recalculate transactions for FY {editingYear}{" "}
                  onwards.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {editingYearHasAdjustment && (
                <Button
                  variant="outline"
                  onClick={handleDeleteAdjustment}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 hover:text-white"
                  disabled={isSaving || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    "Delete Adjustment"
                  )}
                </Button>
              )}

              <Button
                variant="outline"
                onClick={resetEditState}
                className="flex-1 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                disabled={isSaving || isDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAdjustment}
                className="flex-1 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                disabled={isSaving || isDeleting}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  "Save & Recalculate"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OpeningBalanceManagement;
