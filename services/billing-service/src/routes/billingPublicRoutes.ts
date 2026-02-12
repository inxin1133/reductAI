import express from "express"
import { listPublicBillingPlanPrices, listPublicBillingPlans } from "../controllers/billingController"

const router = express.Router()

router.get("/plans", listPublicBillingPlans)
router.get("/plan-prices", listPublicBillingPlanPrices)

export default router
