// routes/openingBalanceRoutes.js
import express from "express";
import {
  getYearWiseBalances,
  saveAdjustment,
} from "../../controller/openingBalanceController.js/openingBalanceController.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";


const router = express.Router();

router.use(authMiddleware);

router.get("/:entityType/:entityId/years", getYearWiseBalances);

router.post("/adjust", saveAdjustment);

export default router;
