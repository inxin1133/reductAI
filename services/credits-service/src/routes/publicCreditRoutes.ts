import express from "express"
import { getMyCreditPreferences, getMyCreditSummary, getMyGrantedCredits, getMyServiceUsage, getMyTopupUsage, getMyUsageHistory, getTenantUsageHistory, listPublicTopupProducts, updateMemberCreditAccess, updateMemberTopupCreditAccess, updateMyCreditPreferences, updateMyTopupAutoUse } from "../controllers/creditController"

const router = express.Router()

router.get("/summary", getMyCreditSummary)
router.get("/tenant-usage-history", getTenantUsageHistory)
router.get("/granted-credits", getMyGrantedCredits)
router.get("/preferences", getMyCreditPreferences)
router.patch("/preferences", updateMyCreditPreferences)
router.get("/service-usage", getMyServiceUsage)
router.get("/topup-usage", getMyTopupUsage)
router.get("/usage-history", getMyUsageHistory)
router.get("/topup-products", listPublicTopupProducts)
router.patch("/member-credit-access", updateMemberCreditAccess)
router.patch("/member-topup-credit-access", updateMemberTopupCreditAccess)
router.patch("/topup-auto-use", updateMyTopupAutoUse)

export default router
