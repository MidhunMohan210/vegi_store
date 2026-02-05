import express from "express";
import { getCompanySettings, updateCompanyFinancialYear } from "../../controller/settingController/companySettingsController.js";



const router = express.Router();

router.get("/:companyId",getCompanySettings );
router.put("/financial-year/:companyId",updateCompanyFinancialYear );

export default router;
