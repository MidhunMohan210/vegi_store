import React, { useState, useEffect, useRef } from "react";
import { Plus, Loader2 } from "lucide-react";
import { units } from "../../../../constants/units";
import { itemMasterQueries } from "../../../hooks/queries/item.queries";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { truncate } from "../../../../../shared/utils/string";
import { NumericFormat } from "react-number-format";

const AddItemForm = ({
  items,
  branch,
  company,
  priceLevel,
  updateTransactionField,
  addItem,
  clickedItemInTable,
  transactionType
}) => {
  const [localItem, setLocalItem] = useState({
    item: null,
    itemCode: "",
    itemName: "",
    unit: units[0]?.value || "",
    quantity: "0",
    rate: "0",
    taxable: false,
    taxRate: "0",
    taxAmount: "0",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [shouldSearch, setShouldSearch] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Refs for all inputs
  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const unitInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const rateInputRef = useRef(null);
  const addButtonRef = useRef(null);

  // TanStack Query - enabled based on shouldSearch flag
  const {
    data: searchResponse,
    isFetching,
    isError,
    error,
  } = useQuery({
    ...itemMasterQueries.search(debouncedSearchTerm, company, branch, 25, true),
    enabled: shouldSearch && debouncedSearchTerm.trim() !== "",
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Show error toast when there's a backend error
  useEffect(() => {
    if (isError && error) {
      toast.error("Search Error", {
        description: "Failed to search for item. Please try again.",
      });
      setShouldSearch(false);
    }
  }, [isError, error]);

  // Update form fields when search results are received
  useEffect(() => {
    // Only process when we were searching and fetch is complete
    if (shouldSearch && !isFetching && searchResponse !== undefined) {
      if (searchResponse?.data && searchResponse.data.length > 0) {
        const foundProduct = searchResponse.data[0];

        // Find the appropriate rate based on priceLevel
        let rate = "";
        if (foundProduct.priceLevels && foundProduct.priceLevels.length > 0 ) {

          if (priceLevel && transactionType==="sale") {
            const priceLevelData = foundProduct.priceLevels.find(
              (pl) =>
                pl.priceLevel._id === priceLevel ||
                pl.priceLevel.priceLevelName === priceLevel
            );
            rate = priceLevelData?.rate || 0;
          } else {
            rate = 0;
          }
        }

        console.log("rate", rate);
        

        // Find current stock for the branch
        let currentStock = "";
        if (foundProduct.stock && foundProduct.stock.length > 0) {
          const branchStock = foundProduct.stock.find(
            (s) => s.branch._id === branch
          );
          currentStock = branchStock?.currentStock || "";
        }

        // Update localItem with found product details
        setLocalItem((prev) => ({
          ...prev,
          item: foundProduct?._id,
          itemCode: foundProduct.itemCode || debouncedSearchTerm,
          itemName: foundProduct.itemName || "",
          priceLevels: foundProduct.priceLevels || [],
          unit: foundProduct.unit || "",
          rate: rate.toString() || "",
          taxable: false,
          taxRate: "0",
          taxAmount: "0",
        }));
        setShowDropdown(false);
        setShouldSearch(false);
        // Auto-focus to unit field after successful search
        setTimeout(() => unitInputRef.current?.focus(), 100);
      } else if (searchResponse?.data && searchResponse.data.length === 0) {
        // No items found - show dropdown with "not found" message
        setLocalItem((prev) => ({
          ...prev,
          itemCode: debouncedSearchTerm,
        }));
        setShowDropdown(true);
        setShouldSearch(false);
      }
    }
  }, [
    searchResponse,
    isFetching,
    shouldSearch,
    debouncedSearchTerm,
    priceLevel,
    branch,
  ]);

  // Update rate when priceLevel changes for an existing item
  useEffect(() => {
    if (!localItem.item) return;

    const foundProduct = searchResponse?.data[0];

    if (!foundProduct || !foundProduct.priceLevels) return;

    let newRate = "";
    if (priceLevel && transactionType==="sale") {
      const priceLevelData = foundProduct.priceLevels.find(
        (pl) =>
          pl.priceLevel._id === priceLevel ||
          pl.priceLevel.priceLevelName === priceLevel
      );
      newRate = priceLevelData?.rate || "0";
    } else {
      newRate = "0";
    }

    // Only update if rate has changed
    if (localItem.rate !== newRate.toString()) {
      setLocalItem((prev) => ({
        ...prev,
        rate: newRate.toString(),
      }));
    }
  }, [priceLevel, localItem.item, searchResponse]);

  // Handle clicked item from table
  useEffect(() => {
    if (clickedItemInTable) {
      const {
        item,
        itemCode,
        itemName,
        unit,
        quantity,
        rate,
        taxable,
        taxRate,
        taxAmount,
      } = clickedItemInTable;

      setLocalItem((prev) => ({
        ...prev,
        item,
        itemCode,
        itemName,
        unit,
        quantity,
        rate,
        taxable,
        taxRate,
        taxAmount,
      }));
      // setSearchTerm(itemCode);
      unitInputRef.current?.focus();
      // codeInputRef.current?.focus();
    }
  }, [clickedItemInTable]);

  // Handle itemCode Enter - trigger search
  const handleCodeKeyDown = (e) => {
    if (e.key === "Enter" && searchTerm.trim() !== "") {
      e.preventDefault();
      setShowDropdown(false);

      setShouldSearch(true);
    }
  };

  // Handle itemCode input change
  const handleCodeChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowDropdown(false);
    setLocalItem({ ...localItem, itemCode: value });
  };

  // Handle Unit Enter - move to quantity
  const handleUnitKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      quantityInputRef.current?.focus();
    }
  };

  // Handle Quantity Enter - move to rate
  const handleQuantityKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      rateInputRef.current?.focus();
    }
  };

  // Handle Rate Enter - move to add button
  const handleRateKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addButtonRef.current?.focus();
    }
  };

  // Add item to the transaction and reset form
  const handleAddClick = () => {
    // Validate required fields
    if (!localItem.itemCode || !localItem.itemName || !localItem.item) {
      toast.error("Validation Error", {
        description: "Please fill in itemCode and itemName fields",
      });
      return;
    }

    // Add item to transaction
    const newItems = addItem(items, localItem);
    updateTransactionField("items", newItems);

    // Reset form to initial state
    setLocalItem({
      item: null,
      itemCode: "",
      itemName: "",
      unit: units[0]?.value || "",
      priceLevels: [],
      quantity: "",
      rate: "",
      baseAmount: "0",
      amountAfterTax: "0",
      taxable: false,
      taxRate: "0",
      taxAmount: "0",
    });
    setSearchTerm("");

    // Focus back to code input for next item entry
    setTimeout(() => codeInputRef.current?.focus(), 0);
  };

  // Handle Enter key on add button - triggers add action
  const handleAddButtonKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddClick();
    }
  };

  return (
    <div className="bg-white shadow-sm px-3 mt-1 py-3 ">
      <div className="grid grid-cols-6 gap-2 items-end">
        {/* CODE INPUT */}
        <div className="relative">
          <label className="block text-[9px] font-medium text-slate-700 mb-1">
            Code
          </label>
          <div className="relative">
            <input
              ref={codeInputRef}
              type="text"
              value={searchTerm}
              onChange={handleCodeChange}
              onKeyDown={handleCodeKeyDown}
              className="w-full px-1.5 py-1 pr-6 border border-slate-300 rounded-xs text-[9px] focus:ring-1 focus:ring-blue-500"
              placeholder="V001"
            />
            {isFetching && (
              <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-600 animate-spin" />
            )}
          </div>

          {/* Dropdown for "Not Found" */}
          {showDropdown && !isFetching && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-300 rounded-xs shadow-lg">
              <div className="px-2 py-1.5 text-[9px] text-red-600 border-b border-slate-200">
                Product not found
              </div>
              <div className="px-2 py-1.5 text-[9px] text-slate-600">
                <span className="font-medium">"{searchTerm}"</span> does not
                exist in inventory
              </div>
            </div>
          )}
        </div>

        {/* NAME */}
        <div>
          <label className="block text-[9px] font-medium text-slate-700 mb-1">
            Name
          </label>
          <input
            ref={nameInputRef}
            type="text"
            disabled
            value={localItem.itemName}
            className="w-full px-1.5 py-1 border border-slate-300 bg-slate-200  text-[9px] focus:ring-1 focus:ring-blue-500"
            placeholder="Name"
          />
        </div>

        {/* UNIT */}
        <div>
          <label className="block text-[9px] font-medium text-slate-700 mb-1">
            Unit
          </label>
          <select
            ref={unitInputRef}
            value={localItem.unit}
            onChange={(e) =>
              setLocalItem({ ...localItem, unit: e.target.value })
            }
            onKeyDown={handleUnitKeyDown}
            className="w-full px-1.5 py-1 border border-slate-300 rounded-xs text-[9px] focus:ring-1 focus:ring-blue-500"
          >
            {units.map((unit) => (
              <option key={unit?.value} value={unit?.value}>
                {unit?.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* QUANTITY INPUT - Allows empty values, no default zero */}
        <div>
          <label className="block text-[9px] font-medium text-slate-700 mb-1">
            Qty
          </label>
          <NumericFormat
            getInputRef={quantityInputRef}
            value={localItem.quantity}
            allowLeadingZeros={false}
            allowNegative={false}
            decimalScale={3}
            onKeyDown={handleQuantityKeyDown}
            onValueChange={(values) => {
              const { value } = values;
              setLocalItem({
                ...localItem,
                quantity: value,
              });
            }}
            className="w-full px-1.5 py-1 border border-slate-300 rounded-xs text-[9px] focus:ring-1 focus:ring-blue-500"
            placeholder="0"
          />
        </div>

        {/* RATE INPUT - Allows empty values and editing */}
        <div>
          <label className="block text-[9px] font-medium text-slate-700 mb-1">
            Rate
          </label>
          <NumericFormat
            getInputRef={rateInputRef}
            value={localItem.rate}
            allowLeadingZeros={false}
            allowNegative={false}
            fixedDecimalScale
            onKeyDown={handleRateKeyDown}
            onValueChange={(values) => {
              const { value } = values;
              setLocalItem({
                ...localItem,
                rate: value,
              });
            }}
            className="w-full px-1.5 py-1 border border-slate-300 rounded-xs text-[9px] focus:ring-1 focus:ring-blue-500"
            placeholder="₹0.00"
          />
        </div>

        {/* ADD BUTTON */}
        <button
          ref={addButtonRef}
          onClick={handleAddClick}
          onKeyDown={handleAddButtonKeyDown}
          className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded-xs flex items-center justify-center transition-colors"
        >
          <Plus className="w-3 h-4" />
        </button>
      </div>
    </div>
  );
};

export default AddItemForm;
