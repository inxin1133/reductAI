"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controllers/chatController");
const chatRuntimeController_1 = require("../controllers/chatRuntimeController");
const requireAuth_1 = require("../middleware/requireAuth");
const router = express_1.default.Router();
// Chat completion endpoint (Admin 설정 기반)
router.post("/", chatController_1.chatCompletion);
// DB-driven runtime endpoint (routing -> model -> template -> history -> call)
router.post("/run", requireAuth_1.requireAuth, chatRuntimeController_1.chatRun);
router.post("/run/cancel", requireAuth_1.requireAuth, chatRuntimeController_1.cancelChatRun);
// History-only endpoint (short content rows + long summaries)
router.get("/conversations/:id/context", requireAuth_1.requireAuth, chatRuntimeController_1.getConversationContext);
exports.default = router;
