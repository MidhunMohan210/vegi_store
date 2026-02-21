// components/ItemMasterForm.jsx
import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemMasterMutations } from "../../../hooks/mutations/itemMasterMutations";
import BranchSelector from "../../../components/BranchSelector";
import {
  Loader2,
  Package,
  Pencil,
  AlertCircle,
  Box,
  FileBarChart,
} from "lucide-react";
import { units } from "../../../../constants/units";
import { toast } from "sonner";
import Keyboard from "react-simple-keyboard";
import "simple-keyboard/build/css/index.css";
import { malayalamLayout } from "@/keyboards/malayalamLayout";
import "@/keyboards/malayalamKeyboard.css";
import OpeningBalanceManagement from "@/components/modals/OpeningBalanceManagement";

const ItemMasterForm = ({ selectedItem, isEditMode, onSuccess, onCancel }) => {
  const queryClient = useQueryClient();
  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany._id,
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch._id,
  );
  const itemNameRef = useRef(null);

  const [selectedBranches, setSelectedBranches] = useState([]);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const keyboardRef = useRef(null);

  console.log(selectedBranches);
  

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      itemName: "",
      itemCode: "",
      unit: "KGS",
    },
  });

  const itemNameValue = watch("itemName");


  // console.log(selectedItem);
  

  const createMutation = useMutation(itemMasterMutations.create(queryClient));
  const updateMutation = useMutation(itemMasterMutations.update(queryClient));
  const isLoading = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (selectedItem && isEditMode) {
      setValue("itemName", selectedItem.itemName);
      setValue("itemCode", selectedItem.itemCode);
      setValue("unit", selectedItem.unit);
      setSelectedBranches(selectedItem.stock.map((s) => s.branch?._id));
    } else {
      reset();
      if (selectedBranchFromStore) {
        setSelectedBranches([selectedBranchFromStore]);
      } else {
        setSelectedBranches([]);
      }
    }
  }, [selectedItem, isEditMode, setValue, reset, selectedBranchFromStore]);

  // Sync keyboard with input field changes
  useEffect(() => {
    if (keyboardRef.current && showKeyboard) {
      keyboardRef.current.setInput(itemNameValue || "");
    }
  }, [itemNameValue, showKeyboard]);


  

  const onSubmit = async (data) => {
    // Close keyboard before saving
    setShowKeyboard(false);
    
    if (selectedBranches.length === 0) {
      toast.error("Please select at least one branch for stock allocation.");
      return;
    }

    const formData = {
      company: selectedCompanyFromStore,
      itemName: data.itemName,
      itemCode: data.itemCode,
      unit: data.unit,
      category: null,
      priceLevels: [],
      stock: selectedBranches.map((branchId) => ({
        branch: branchId,
        openingStock: 0,
        currentStock: 0,
        openingRate: 0,
      })),
      status: "active",
    };

    if (isEditMode && selectedItem) {
      updateMutation.mutate(
        { id: selectedItem._id, formData },
        { onSuccess: () => onSuccess() },
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: () => {
          onSuccess();
          reset();
          if (selectedBranchFromStore)
            setSelectedBranches([selectedBranchFromStore]);
          else setSelectedBranches([]);
        },
      });
    }
  };

  const InputLabel = ({ label, required }) => (
    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );

  const ErrorMessage = ({ message }) => (
    <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1 font-medium">
      <AlertCircle className="w-3 h-3" /> {message}
    </p>
  );

  const inputClass =
    "w-full rounded-xs text-xs border border-slate-300 rounded-md px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <>
      <div className="h-full flex flex-col bg-slate-50 border-l border-slate-200 shadow-sm relative overflow-hidden">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-50 flex items-center justify-center flex-col gap-2">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-xs font-medium text-slate-600">
            Saving item...
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex-none px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3">
        <div
          className={`p-2 rounded-sm ${isEditMode ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}
        >
          {isEditMode ? (
            <Pencil className="w-4 h-4" />
          ) : (
            <Package className="w-4 h-4" />
          )}
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            {isEditMode ? "Edit Item" : "New Item"}
          </h2>
          <p className="text-[11px] text-slate-500 font-medium">
            {isEditMode
              ? "Update item details below"
              : "Add a new product to inventory"}
          </p>
        </div>
      </div>

      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-white p-4 rounded-sm border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Item Details
              </span>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <InputLabel label="Item Name" required />
                <input
                  ref={itemNameRef}
                  {...register("itemName", {
                    required: "Item name is required",
                    validate: {
                      notEmpty: (v) =>
                        v?.trim().length > 0 || "Cannot be empty",
                    },
                    onChange: (e) => {
                      // Sync keyboard when typing in input field
                      if (keyboardRef.current && showKeyboard) {
                        keyboardRef.current.setInput(e.target.value);
                      }
                    },
                  })}
                  className={inputClass}
                  placeholder="e.g., Premium Rice / പ്രീമിയം അരി"
                  disabled={isLoading}
                  onBlur={(e) => {
                    setValue("itemName", e.target.value.trim(), {
                      shouldValidate: true,
                    });
                    setShowKeyboard(false);
                  }}
                />

                {/* Keyboard Icon */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blur from firing
                    itemNameRef.current?.focus();
                    setShowKeyboard(true);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600"
                >
                  ⌨️
                </button>
                {errors.itemName && (
                  <ErrorMessage message={errors.itemName.message} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <InputLabel label="Item Code" required />
                  <input
                    {...register("itemCode", {
                      required: "Code is required",
                      validate: {
                        notEmpty: (v) =>
                          v?.trim().length > 0 || "Cannot be empty",
                      },
                    })}
                    className={`${inputClass} font-mono`}
                    placeholder="e.g., ITM-001"
                    disabled={isLoading}
                    onBlur={(e) =>
                      setValue("itemCode", e.target.value.trim(), {
                        shouldValidate: true,
                      })
                    }
                  />
                  {errors.itemCode && (
                    <ErrorMessage message={errors.itemCode.message} />
                  )}
                </div>

                <div>
                  <InputLabel label="Unit" required />
                  <div className="relative">
                    <select
                      {...register("unit")}
                      className={`${inputClass} appearance-none`}
                      disabled={isLoading}
                    >
                      {units.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.displayName}
                        </SelectItem>
                      ))}
                    </select>
                    <Box className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <InputLabel label="Branch Availability" />
                <div className="bg-slate-50/50 p-1 rounded-md">
                  <BranchSelector
                    companyId={selectedCompanyFromStore}
                    selectedBranches={selectedBranches}
                    setSelectedBranches={setSelectedBranches}
                    disabled={isLoading}
                  />
                </div>
                {selectedBranches.length === 0 && (
                  <ErrorMessage message="Select at least one branch" />
                )}
              </div>

              {isEditMode && selectedItem?._id && (
                <button
                  type="button"
                  onClick={() => setShowOpeningBalanceModal(true)}
                  disabled={isLoading}
                  className="w-full bg-slate-100 border-2 border-blue-200 text-blue-700 text-sm font-bold py-4 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <FileBarChart className="w-4 h-4" />
                  Manage Year-wise Opening Balances
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Fixed Footer Buttons */}
      <div className="flex-none p-4 bg-white border-t border-slate-200 flex flex-col gap-3 z-10">
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={isLoading}
          className="w-full bg-slate-800 text-white text-xs font-bold py-3 rounded-sm hover:bg-slate-700 active:bg-slate-900 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isEditMode ? (
            "Update Item"
          ) : (
            "Create Item"
          )}
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full bg-white text-slate-600 border border-slate-200 text-xs font-bold py-2.5 rounded-sm hover:bg-slate-50 hover:text-slate-800 transition-all"
          >
            Cancel
          </button>
        )}
      </div>

      {showKeyboard && (
        <div 
          className="fixed bottom-0 right-0 z-[9999] w-[50%] max-h-[80%] overflow-y-auto bg-black shadow-2xl"
          onMouseDown={(e) => {
            // Prevent clicks on keyboard from removing focus from input
            e.preventDefault();
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900 rounded-t-md border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-200">
              Malayalam Keyboard
            </span>

            <button
              onClick={() => {
                setShowKeyboard(false);
                itemNameRef.current?.blur();
              }}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition"
            >
              ✕
            </button>
          </div>

          {/* Keyboard Body */}
          <div className="p-3 bg-transparent">
            <Keyboard
              keyboardRef={(r) => (keyboardRef.current = r)}
              layout={malayalamLayout}
              onChange={(input) => {
                setValue("itemName", input, { shouldValidate: true });
              }}
              onRender={() => {
                // Sync keyboard with current input value when it renders
                if (keyboardRef.current) {
                  keyboardRef.current.setInput(itemNameValue || "");
                }
              }}
            />
          </div>
        </div>
      )}
      </div>

      <OpeningBalanceManagement
        open={showOpeningBalanceModal}
        onOpenChange={setShowOpeningBalanceModal}
        entityType="item"
        entityId={selectedItem?._id}
        entityName={itemNameValue || selectedItem?.itemName || "Item"}
      />
    </>
  );
};

// Simple helper for unit options if select element needs direct mapping
const SelectItem = ({ value, children }) => (
  <option value={value}>{children}</option>
);

export default ItemMasterForm;
