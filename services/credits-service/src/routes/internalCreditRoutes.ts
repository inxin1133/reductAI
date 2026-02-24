import express from "express"
import { grantSubscriptionCredits } from "../controllers/creditController"

const router = express.Router()

router.post("/subscription-grant", grantSubscriptionCredits)

export default router
