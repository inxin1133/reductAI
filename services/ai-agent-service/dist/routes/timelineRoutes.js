"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const timelineController_1 = require("../controllers/timelineController");
const requireAuth_1 = require("../middleware/requireAuth");
const router = express_1.default.Router();
// Timeline은 "사용자별" 저장이므로 인증을 강제합니다.
router.use(requireAuth_1.requireAuth);
// threads
router.get("/threads", timelineController_1.listThreads);
router.post("/threads", timelineController_1.createThread);
router.patch("/threads/:id", timelineController_1.updateThreadTitle);
// messages
router.get("/threads/:id/messages", timelineController_1.listMessages);
router.post("/threads/:id/messages", timelineController_1.addMessage);
exports.default = router;
