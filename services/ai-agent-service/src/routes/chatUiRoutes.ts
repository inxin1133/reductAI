import express from "express"
import { getChatPromptSuggestions, getChatUiConfig } from "../controllers/chatUiController"
import { requireAuth } from "../middleware/requireAuth"

const router = express.Router()

router.get("/config", getChatUiConfig)
router.get("/prompt-suggestions", requireAuth, getChatPromptSuggestions)

export default router


