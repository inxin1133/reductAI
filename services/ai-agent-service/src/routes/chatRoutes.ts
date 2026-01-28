import express from "express"
import { chatCompletion } from "../controllers/chatController"
import { cancelChatRun, chatRun, getConversationContext } from "../controllers/chatRuntimeController"
import { requireAuth } from "../middleware/requireAuth"

const router = express.Router()

// Chat completion endpoint (Admin 설정 기반)
router.post("/", chatCompletion)

// DB-driven runtime endpoint (routing -> model -> template -> history -> call)
router.post("/run", requireAuth, chatRun)
router.post("/run/cancel", requireAuth, cancelChatRun)

// History-only endpoint (short content rows + long summaries)
router.get("/conversations/:id/context", requireAuth, getConversationContext)

export default router


