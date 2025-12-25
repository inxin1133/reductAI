import express from "express"
import { getUsageLog, listUsageLogs } from "../controllers/usageLogsController"

const router = express.Router()

// Admin: model usage logs
router.get("/", listUsageLogs)
router.get("/:id", getUsageLog)

export default router


