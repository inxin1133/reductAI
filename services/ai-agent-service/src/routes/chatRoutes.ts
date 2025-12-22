import express from "express"
import { chatCompletion } from "../controllers/chatController"

const router = express.Router()

// Chat completion endpoint (Admin 설정 기반)
router.post("/", chatCompletion)

export default router


