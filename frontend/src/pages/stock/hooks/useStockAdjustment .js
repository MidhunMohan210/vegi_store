// hooks/useStockAdjustment.js
import { useState, useCallback, useEffect, useRef } from "react";
import {
  calculateStockAdjustmentTotals,
  createEmptyStockAdjustment,
} from "../../Transactions/utils/stockadjustmentUtils";

/**
 * Custom hook for managing stock adjustment state and operations
 * Handles adjustment data, items, calculations, and user interactions
 * 
 * @param {Object} initialData - Optional initial stock adjustment data
 * @returns {Object} Stock adjustment state and handler functions
 */
export const useStockAdjustment = (initialData = null) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [stockAdjustmentData, setStockAdjustmentData] = useState(
    initialData || createEmptyStockAdjustment()
  );

  const [clickedItemInTable, setClickedItemInTable] = useState(null);

  // ============================================================================
  // ITEM MANAGEMENT HANDLERS
  // ============================================================================

  const handleItemClickInItemsTable = useCallback((item) => {
    setClickedItemInTable(item);
  }, []);

  const addItem = (items, newItem) => {
    const quantity = parseFloat(newItem.quantity) || 0;
    const adjustmentType = newItem.adjustmentType || "add"; // "add" or "remove"

    const normalizedItem = {
      ...newItem,
      quantity: quantity.toString(),
      adjustmentType,
      adjustmentReason: newItem.adjustmentReason || "",
    };

    const existingItemIndex = items.findIndex(
      (item) => item?.item === normalizedItem?.item
    );

    if (existingItemIndex !== -1) {
      const updatedItems = [...items];
      updatedItems.splice(existingItemIndex, 1);
      return [normalizedItem, ...updatedItems];
    } else {
      return [normalizedItem, ...items];
    }
  };

  const updateItemQuantity = useCallback((index, qty) => {
    setStockAdjustmentData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, quantity: qty } : item
      ),
    }));
  }, []);

  const updateItemAdjustmentType = useCallback((index, adjustmentType) => {
    setStockAdjustmentData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, adjustmentType } : item
      ),
    }));
  }, []);

  const removeItem = useCallback((index) => {
    setStockAdjustmentData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }, []);

  // ============================================================================
  // STOCK ADJUSTMENT DATA HANDLERS
  // ============================================================================

  const updateStockAdjustmentData = useCallback((updates) => {
    setStockAdjustmentData((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateStockAdjustmentField = useCallback((field, value) => {
    setStockAdjustmentData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ============================================================================
  // RESET & CLEAR HANDLERS
  // ============================================================================

  const resetStockAdjustmentData = useCallback(() => {
    console.log("Resetting stock adjustment data");
    setStockAdjustmentData(createEmptyStockAdjustment());
  }, []);

  // ============================================================================
  // AUTOMATIC CALCULATIONS
  // ============================================================================

  useEffect(() => {
    setStockAdjustmentData((prev) => calculateStockAdjustmentTotals(prev));
  }, [stockAdjustmentData.items]);

  // ============================================================================
  // RETURN API
  // ============================================================================

  return {
    // State
    stockAdjustmentData,
    clickedItemInTable,
    setClickedItemInTable,
    
    // Stock adjustment data updates
    updateStockAdjustmentData,
    updateStockAdjustmentField,
    setStockAdjustmentData,
    
    // Item operations
    addItem,
    updateItemQuantity,
    updateItemAdjustmentType,
    removeItem,
    handleItemClickInItemsTable,
    
    // Reset & clear
    resetStockAdjustmentData,
  };
};
