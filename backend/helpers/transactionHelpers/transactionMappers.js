import { PaymentModel, ReceiptModel } from "../../model/FundTransactionMode.js";
import {
  PurchaseModel,
  SalesModel,
  SalesReturnModel,
  PurchaseReturnModel,
} from "../../model/TransactionModel.js";

export const transactionTypeToModelName = (transactionType) => {
  const mapping = {
    sale: "Sale",
    purchase: "Purchase",
    sales_return: "SalesReturn",
    purchase_return: "PurchaseReturn",
    receipt: "Receipt",
    payment: "Payment",
  };

  return mapping[transactionType] || transactionType;
};
export const transactionModelToType = (transactionModel) => {
  const mapping = {
    Sale: "sale",
    Purchase: "purchase",
    SalesReturn: "sales_return",
    PurchaseReturn: "purchase_return",
    Receipt: "receipt",
    Payment: "payment",
  };

  return mapping[transactionModel] || transactionModel;
};

// This function now returns the actual Mongoose model
export const getTransactionModel = (transactionType) => {
  const mapping = {
    sale: SalesModel,
    purchase: PurchaseModel,
    receipt: ReceiptModel,
    payment: PaymentModel,
    sales_return: SalesReturnModel, // You'll need to create these
    purchase_return: PurchaseReturnModel, // You'll need to create these
  };

  return mapping[transactionType];
};
