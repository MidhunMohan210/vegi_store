import React, { useEffect, useMemo, useState } from "react";
import AddItemFormComponent from "../Transactions/components/AddItemForm";
import ItemsTableComponent from "../Transactions/components/ItemsTable";
import TransactionActionsComponent from "../Transactions/components/StockTransactionAction";
import TransactionHeaderComponent from "../CommonTransactionComponents/TransactionHeader";
import CustomMoonLoader from "../../components/loaders/CustomMoonLoader";
import { useStockAdjustment } from "../stock/hooks/useStockAdjustment ";
import { useStockAdjustmentActions } from "../stock/hooks/useStockAdjustmentActions ";
import TransactionSummaryComponent from "../Transactions/components/TransactionSummary";
import { useSelector } from "react-redux";

// Memoized components
const TransactionHeader = React.memo(TransactionHeaderComponent);
const AddItemForm = React.memo(AddItemFormComponent);
const ItemsTable = React.memo(ItemsTableComponent);
const StockTransactionAction = React.memo(TransactionActionsComponent);
const TransactionSummary = React.memo(TransactionSummaryComponent);

const CreateStockAdjustment = () => {
  const [isLoading, setIsLoading] = useState(false);

  const {
    stockAdjustmentData,
    updateStockAdjustmentField,
    updateItemQuantity,
    removeItem,
    addItem,
    // handleDiscountChange,
    // handlePaidAmountChange,
    clickedItemInTable,
    handleItemClickInItemsTable,
    resetStockAdjustmentData,
    setClickedItemInTable,

  } = useStockAdjustment();

  const selectedCompanyFromStore = useSelector(
    (state) => state.companyBranch?.selectedCompany
  );
  const selectedBranchFromStore = useSelector(
    (state) => state.companyBranch?.selectedBranch
  );

  // Initialize with default adjustment type
  useEffect(() => {
    updateStockAdjustmentField("adjustmentType", "add");
  }, [updateStockAdjustmentField]);

  // Set company and branch
  useEffect(() => {
    if (selectedCompanyFromStore?._id) {
      updateStockAdjustmentField("company", selectedCompanyFromStore._id);
    }
    if (selectedBranchFromStore?._id) {
      updateStockAdjustmentField("branch", selectedBranchFromStore._id);
    }
  }, [
    selectedCompanyFromStore,
    selectedBranchFromStore,
    updateStockAdjustmentField,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetStockAdjustmentData();
    };
  }, [resetStockAdjustmentData]);

  const { handleSave } = useStockAdjustmentActions(stockAdjustmentData, false);

  const onSave = async () => {
    setIsLoading(true);
    const success = await handleSave();
    setIsLoading(false);

    if (success) {
      resetStockAdjustmentData();
    }
  };

  console.log("stockAdjustmentData", stockAdjustmentData);

  return (
    <div className="h-[calc(100vh-110px)] w-full bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden relative">
      {/* Loader Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center">
          <CustomMoonLoader />
        </div>
      )}

      {/* Header */}
      <TransactionHeader
        currentTransactionType="stock_adjustment"
        date={stockAdjustmentData.transactionDate}
        updateTransactionField={updateStockAdjustmentField}
      />

      {/* Main Content - Same structure as CreateTransaction */}
      <div className="flex ">
        <div className="flex-1 p-1 overflow-hidden flex flex-col">
          <div className="flex flex-col  bg-white">
            {/* Radio Buttons - Add To Stock / Remove From Stock */}
            {/* Add To Stock / Remove From Stock Radio Buttons */}
            <div className="px-3 py-6  border-b border-gray-200 ">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-medium text-gray-700">
                    Add To Stock
                  </span>
                  <input
                    type="radio"
                    name="adjustmentType"
                    value="add"
                    checked={stockAdjustmentData.adjustmentType === "add"}
                    onChange={(e) =>
                      updateStockAdjustmentField(
                        "adjustmentType",
                        e.target.value
                      )
                    }
                    className="w-3 h-3 text-green-600 focus:ring-green-500"
                  />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-medium text-gray-700">
                    Remove From Stock
                  </span>
                  <input
                    type="radio"
                    name="adjustmentType"
                    value="remove"
                    checked={stockAdjustmentData.adjustmentType === "remove"}
                    onChange={(e) =>
                      updateStockAdjustmentField(
                        "adjustmentType",
                        e.target.value
                      )
                    }
                    className="w-3 h-3  text-red-600 text-red-600 focus:ring-red-500"
                  />
                </label>
              </div>
            </div>

            {/* Add Item Form */}
            <AddItemForm
              requireAccount={false}
              items={stockAdjustmentData?.items}
              branch={selectedBranchFromStore?._id}
              company={selectedCompanyFromStore?._id}
              priceLevel={null}
              updateTransactionField={updateStockAdjustmentField}
              addItem={addItem}
              clickedItemInTable={clickedItemInTable}
              transactionType="stock_adjustment"
              account={null}
              setClickedItemInTable={setClickedItemInTable}

            />
          </div>

          <div className="flex-1">
            {/* Items Table */}
            <ItemsTable
              items={stockAdjustmentData?.items}
              onUpdateQuantity={updateItemQuantity}
              onRemoveItem={removeItem}
              handleItemClickInItemsTable={handleItemClickInItemsTable}
            />



            {/* Transaction Summary */}
            <TransactionSummary
              total={stockAdjustmentData.totalAmount}
              netAmount={stockAdjustmentData.totalAmount}
              discount={0}
              paidAmount={stockAdjustmentData.paidAmount}
              balanceAmount={stockAdjustmentData.totalAmount}
              totalDue={stockAdjustmentData.totalAmount}
              onDiscountChange={/* handleDiscountChange */ () => {}}
              onPaidAmountChange={/* handlePaidAmountChange */ () => {}}
              transactionType={stockAdjustmentData.transactionType}
            />

            {/* Action Buttons */}
            <StockTransactionAction
              onSave={onSave}
              transactionData={stockAdjustmentData}
              onLoadingChange={setIsLoading}
              resetTransactionData={resetStockAdjustmentData}
              isEditMode={false}
              requireAccount={false}
              onCancel={() => {
                resetStockAdjustmentData();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateStockAdjustment;
