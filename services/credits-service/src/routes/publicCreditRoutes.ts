import express from "express"
import { getMyCreditPreferences, getMyCreditSummary, getMyGrantedCredits, getMyServiceUsage, getMyTopupUsage, listPublicTopupProducts, updateMemberCreditAccess, updateMemberTopupCreditAccess, updateMyCreditPreferences, updateMyTopupAutoUse } from "../controllers/creditController"

const router = express.Router()

router.get("/summary", getMyCreditSummary)
router.get("/granted-credits", getMyGrantedCredits)
router.get("/preferences", getMyCreditPreferences)
router.patch("/preferences", updateMyCreditPreferences)
router.get("/service-usage", getMyServiceUsage)
router.get("/topup-usage", getMyTopupUsage)
router.get("/topup-products", listPublicTopupProducts)
router.patch("/member-credit-access", updateMemberCreditAccess)
router.patch("/member-topup-credit-access", updateMemberTopupCreditAccess)
router.patch("/topup-auto-use", updateMyTopupAutoUse)

export default router
