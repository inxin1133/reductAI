import express from "express"
import { checkCanConsume, deductCreditsForUsage, grantSubscriptionCredits } from "../controllers/creditController"

const router = express.Router()

router.post("/subscription-grant", grantSubscriptionCredits)
router.post("/deduct-for-usage", deductCreditsForUsage)
router.post("/check-can-consume", checkCanConsume)

export default router
