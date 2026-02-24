import express from "express"
import { getMyCreditSummary } from "../controllers/creditController"

const router = express.Router()

router.get("/summary", getMyCreditSummary)

export default router
