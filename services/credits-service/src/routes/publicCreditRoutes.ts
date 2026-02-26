import express from "express"
import { getMyCreditSummary, getMyServiceUsage, listPublicTopupProducts, updateMemberCreditAccess, updateMyTopupAutoUse } from "../controllers/creditController"

const router = express.Router()

router.get("/summary", getMyCreditSummary)
router.get("/service-usage", getMyServiceUsage)
router.get("/topup-products", listPublicTopupProducts)
router.patch("/member-credit-access", updateMemberCreditAccess)
router.patch("/topup-auto-use", updateMyTopupAutoUse)

export default router
