import express from "express"
import {createUsers, getUserById, updateUserAccess} from "../../controller/master/userController.js"
const router=express.Router()


router.post("/createusers",createUsers)
router.get("/:id",getUserById)
router.put("/update-access/:id", updateUserAccess)
export default router
