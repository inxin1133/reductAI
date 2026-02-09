import express from "express"
import { getWebSearchSettings, updateWebSearchSettings } from "../controllers/webSearchSettingsController"

const router = express.Router()

// Admin-only settings (currently no auth enforced)
router.get("/", getWebSearchSettings)
router.put("/", updateWebSearchSettings)

export default router
