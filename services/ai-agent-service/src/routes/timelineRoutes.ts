import express from "express"
import { addMessage, createThread, getMessageMedia, listMessages, listThreads, updateThreadTitle } from "../controllers/timelineController"
import { requireAuth } from "../middleware/requireAuth"

const router = express.Router()

// Timeline은 "사용자별" 저장이므로 인증을 강제합니다.
router.use(requireAuth)

// threads
router.get("/threads", listThreads)
router.post("/threads", createThread)
router.patch("/threads/:id", updateThreadTitle)

// messages
router.get("/threads/:id/messages", listMessages)
router.post("/threads/:id/messages", addMessage)
// media proxy (prevents huge base64 payloads in listMessages)
router.get("/threads/:id/messages/:messageId/media/:kind/:index", getMessageMedia)

export default router


