// routes/openingBalanceRoutes.js
import express from "express";
import {
  getYearWiseBalances,
  saveAdjustment,
  cancelAdjustment,
} from "../../controller/openingBalanceController.js/openingBalanceController.js";
import { authMiddleware } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/:entityType/:entityId/years", getYearWiseBalances);

router.post("/adjust", saveAdjustment);
router.delete("/adjust/:adjustmentId", cancelAdjustment);

export default router;
