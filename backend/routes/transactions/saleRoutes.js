import express from "express";
import {
  createTransaction,
  editTransaction,
  getTransactionDetail,
  getTransactions,
  deleteTransaction
} from "../../controller/transactionController/transactionController.js";
import { checkFYRange } from "../../middlewares/checkFYRange.js";
const router = express.Router();

  router.post("/create", checkFYRange("transactionDate"), createTransaction);
  router.get("/getall", getTransactions);
  router.get("/getTransactionDetails/:transactionId", getTransactionDetail);
  router.put("/edit/:transactionId", checkFYRange("transactionDate"), editTransaction);
  router.delete("/delete/:transactionId", checkFYRange("transactionDate"), deleteTransaction);

export default router;
