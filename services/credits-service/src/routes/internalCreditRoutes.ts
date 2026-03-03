import express from "express"
import { deductCreditsForUsage, grantSubscriptionCredits } from "../controllers/creditController"

const router = express.Router()

router.post("/subscription-grant", grantSubscriptionCredits)
router.post("/deduct-for-usage", deductCreditsForUsage)

export default router
