import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Loader2 } from "lucide-react";
import { units } from "../../../../constants/units";
import { itemMasterQueries } from "../../../hooks/queries/item.queries";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { NumericFormat } from "react-number-format";

const AddItemForm = ({
  items,
  branch,
  company,
  priceLevel,
  updateTransactionField,
  addItem,
  clickedItemInTable,
  transactionType,
  account,
  requireAccount = true,
  setClickedItemInTable,
}) => {
  const [localItem, setLocalItem] = useState({
    item: null,
    itemCode: "",
    itemName: "",
    unit: units[0]?.value || "", // still kept internally (not shown in UI)
    priceLevels: [],
    quantity: "",
    rate: "",
    baseAmount: "0",
    amountAfterTax: "0",
    taxable: false,
    taxRate: "0",
    taxAmount: "0",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 500);




  // Refs
  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const rateInputRef = useRef(null);
  const addButtonRef = useRef(null);

  const isSearchEnabled =
    debouncedSearchTerm.trim() !== "" &&
    (transactionType === "sale" ||
      transactionType === "sales_return" ||
      transactionType === "stock_adjustment" ||
      transactionType === "purchase" ||
      transactionType === "purchase_return");

  // console.log(isSearchEnabled);
  // console.log(debouncedSearchTerm);
  console.log();

  useEffect(() => {
    clearLocalItemData();
  }, [transactionType]);

  useEffect(() => {
    if (isSearchEnabled) {
      setLocalItem({
        item: null,
        itemCode: debouncedSearchTerm,
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
        availableQuantity: "",
      });
      setClickedItemInTable(null);
    }
  }, [debouncedSearchTerm, isSearchEnabled]);

  const {
    data: searchResponse,
    isFetching,
    isError,
    error,
  } = useQuery({
    ...itemMasterQueries.search(
      debouncedSearchTerm,
      company,
      branch,
      25,
      true,
      account,
      transactionType,
    ),
    enabled: isSearchEnabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error("Search Error", {
        description: "Failed to search for item. Please try again.",
      });
    }
  }, [isError, error]);

  useEffect(() => {
    if (
      !isFetching &&
      searchResponse !== undefined &&
      debouncedSearchTerm.trim() !== ""
    ) {
      // if (requireAccount && !account) {
      //   toast.error("Customer Not Selected", {
      //     description: "Please select a customer before adding items.",
      //   });
      //   return;
      // }

      if (searchResponse?.data && searchResponse.data.length > 0) {
        const foundProduct = searchResponse.data[0];

        let rate = "";

        // Price level priority (sale / sales_return)
        if (
          foundProduct.priceLevels &&
          foundProduct.priceLevels.length > 0 &&
          priceLevel &&
          (transactionType === "sale" || transactionType === "sales_return")
        ) {
          const priceLevelData = foundProduct?.priceLevels?.find(
            (pl) =>
              pl?.priceLevel?._id === priceLevel ||
              pl?.priceLevel?.priceLevelName === priceLevel,
          );
          rate = priceLevelData?.rate || "";
        }

        // Fallback lastRate
        if (!rate && foundProduct.lastRate) {
          rate = foundProduct.lastRate;
        }

        const currentStock = foundProduct.stock?.find(
          (st) => st.branch._id === branch,
        );

        const availableQty = currentStock ? currentStock.currentStock : 0;

        setLocalItem((prev) => ({
          ...prev,
          item: foundProduct?._id,
          itemCode: foundProduct.itemCode || debouncedSearchTerm,
          itemName: foundProduct.itemName || "",
          priceLevels: foundProduct.priceLevels || [],
          unit: foundProduct.unit || prev.unit, // still stored, not editable
          rate: rate?.toString?.() || "",
          taxable: false,
          taxRate: "0",
          taxAmount: "0",
          availableQuantity: availableQty.toString(),
        }));

        setShowDropdown(false);

        // focus Qty directly (since Unit is removed)
        // setTimeout(() => quantityInputRef.current?.focus(), 100);
      } else if (searchResponse?.data && searchResponse.data.length === 0) {
        setLocalItem((prev) => ({
          ...prev,
          itemCode: debouncedSearchTerm,
        }));
        setShowDropdown(true);
      }
    }
  }, [
    searchResponse,
    isFetching,
    debouncedSearchTerm,
    priceLevel,
    branch,
    requireAccount,
    account,
    transactionType,
  ]);

  useEffect(() => {
    if (!localItem.item) return;
    const foundProduct = searchResponse?.data[0];
    if (!foundProduct) return;

    let newRate = "";

    if (
      foundProduct.priceLevels &&
      foundProduct.priceLevels.length > 0 &&
      priceLevel &&
      (transactionType === "sale" || transactionType === "sales_return")
    ) {
      const priceLevelData = foundProduct?.priceLevels?.find(
        (pl) =>
          pl?.priceLevel?._id === priceLevel ||
          pl?.priceLevel?.priceLevelName === priceLevel,
      );
      newRate = priceLevelData?.rate || "";
    }

    if (!newRate && foundProduct.lastRate) {
      newRate = foundProduct.lastRate.toString();
    }

    if ((localItem.rate || "") !== (newRate?.toString?.() || "")) {
      setLocalItem((prev) => ({
        ...prev,
        rate: newRate?.toString?.() || "",
      }));
    }
  }, [priceLevel, localItem.item, searchResponse, transactionType]);

  useEffect(() => {
    console.log(clickedItemInTable);

    if (clickedItemInTable !== null && clickedItemInTable !== undefined) {
      const selectedItem = items[clickedItemInTable];

      console.log(selectedItem);

      if (!selectedItem) return;

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
      } = selectedItem;

      setLocalItem((prev) => ({
        ...prev,
        item,
        itemCode,
        itemName,
        unit: unit || prev.unit, // keep internally
        quantity,
        rate,
        taxable,
        taxRate,
        taxAmount,
      }));

      quantityInputRef.current?.focus();
    }
  }, [clickedItemInTable]);

  const handleCodeKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      // Only move to Qty if product is already loaded
      if (localItem.item && localItem.itemName) {
        quantityInputRef.current?.focus();
      } else if (searchTerm.trim() !== "") {
        toast.error("Product not loaded", {
          description: "Please wait until product is fetched.",
        });
      }
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowDropdown(false);

    // Clear item data when user starts typing a new code
    if (value !== localItem.itemCode) {
      setLocalItem((prev) => ({
        ...prev,
        item: null,
        itemCode: value,
        itemName: "",
        priceLevels: [],
        rate: "",
        taxable: false,
        taxRate: "0",
        taxAmount: "0",
        availableQuantity: "",
      }));
    }
  };

  const handleQuantityKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      rateInputRef.current?.focus();
    }
  };

  const handleRateKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addButtonRef.current?.focus();
    }
  };

  const amountValue = useMemo(() => {
    const q = parseFloat(localItem.quantity) || 0;
    const r = parseFloat(localItem.rate) || 0;
    return q * r;
  }, [localItem.quantity, localItem.rate]);

  const handleAddClick = (clickedItemIndex = null) => {
    if (
      !localItem.itemCode ||
      !localItem.itemName ||
      !localItem.item ||
      !localItem.quantity
    ) {
      toast.error("Validation Error", {
        description: "Name, Code, and Quantity are required",
      });
      return;
    }

    const quantity = parseFloat(localItem.quantity) || 0;
    const rate = parseFloat(localItem.rate) || 0;
    const baseAmount = quantity * rate;

    const taxRate = parseFloat(localItem.taxRate) || 0;
    const taxAmount = localItem.taxable ? (baseAmount * taxRate) / 100 : 0;
    const amountAfterTax = baseAmount + taxAmount;

    const itemToAdd = {
      ...localItem,
      quantity: localItem.quantity,
      rate: localItem.rate,
      baseAmount: baseAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      amountAfterTax: amountAfterTax.toFixed(2),
    };
    console.log(clickedItemIndex);

    // console.log(itemToAdd);

    const newItems = addItem(items, itemToAdd, clickedItemIndex);
    updateTransactionField("items", newItems);

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
    setTimeout(() => codeInputRef.current?.focus(), 0);
  };

  const handleAddButtonKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddClick(clickedItemInTable);
    }
  };

  const clearLocalItemData = () => {
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
    setShowDropdown(false);
  };

  return (
    <div className="bg-white shadow-sm px-3 mt-1 py-3">
      {/* Code, Name, Qty, Rate, Amount, Add */}
      <div className="grid grid-cols-6 gap-2 items-end">
        {/* CODE */}
        <div className="relative">
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Code
          </label>
          <div className="relative">
            <input
              ref={codeInputRef}
              type="text"
              value={searchTerm}
              onChange={handleCodeChange}
              onKeyDown={handleCodeKeyDown}
              className="w-full px-1.5 py-1 pr-6 border border-slate-300 rounded-xs text-[11px] focus:ring-1 focus:ring-blue-500"
              placeholder="V001"
            />
            {isFetching && (
              <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-600 animate-spin" />
            )}
          </div>

          {showDropdown && !isFetching && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-300 rounded-xs shadow-lg">
              <div className="px-2 py-1.5 text-[11px] text-red-600 border-b border-slate-200">
                Product not found
              </div>
              <div className="px-2 py-1.5 text-[11px] text-slate-600">
                <span className="font-medium">"{searchTerm}"</span> does not
                exist in inventory
              </div>
            </div>
          )}
        </div>

        {/* NAME */}
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Name
          </label>
          <input
            ref={nameInputRef}
            type="text"
            disabled
            value={localItem.itemName}
            className="w-full px-1.5 py-1 border border-slate-300 bg-slate-200 text-[11px] focus:ring-1 focus:ring-blue-500"
            placeholder="Name"
          />
        </div>

        {/* QTY */}
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Qty
          </label>
          <NumericFormat
            getInputRef={quantityInputRef}
            value={localItem.quantity}
            allowLeadingZeros={false}
            allowNegative={false}
            decimalScale={3}
            onKeyDown={handleQuantityKeyDown}
            isAllowed={(values) => {
              const { floatValue } = values;

              // For sale or purchase_return, check against available quantity
              if (
                transactionType === "sale" ||
                transactionType === "purchase_return"
              ) {
                if (localItem.availableQuantity !== "") {
                  const maxQty = parseFloat(localItem.availableQuantity);

                  console.log(localItem.availableQuantity);

                  if (floatValue > maxQty) {
                    toast.error("Insufficient Stock", {
                      description: `Only ${localItem.availableQuantity} units available in stock.`,
                    });
                    return false; // This prevents the value from being set
                  }
                }
              }

              return true; // Allow the value
            }}
            onValueChange={(values) => {
              const { value } = values;
              setLocalItem({ ...localItem, quantity: value });
            }}
            className="w-full px-1.5 py-1 border border-slate-300 rounded-xs text-[11px] focus:ring-1 focus:ring-blue-500"
            placeholder="0"
          />
        </div>

        {/* RATE */}
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
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
              setLocalItem({ ...localItem, rate: value });
            }}
            className="w-full px-1.5 py-1 border border-slate-300 rounded-xs text-[11px] focus:ring-1 focus:ring-blue-500"
            placeholder="₹0.00"
          />
        </div>

        {/* AMOUNT (Qty * Rate) - read-only display */}
        <div>
          <label className="block text-[11px] font-medium text-slate-700 mb-1">
            Amount
          </label>
          <NumericFormat
            value={amountValue}
            displayType="input"
            thousandSeparator
            decimalScale={2}
            fixedDecimalScale
            readOnly
            className="w-full px-1.5 py-1 border border-slate-300 bg-slate-200 rounded-xs text-[11px] text-left" // Changed text-right to text-left
            placeholder="0.00"
          />
        </div>

        {/* ADD */}
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
