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
router.get("/threads/deleted", timelineController_1.listDeletedThreads);
router.post("/threads", timelineController_1.createThread);
router.patch("/threads/:id", timelineController_1.updateThreadTitle);
router.delete("/threads/:id", timelineController_1.deleteThread);
router.post("/threads/:id/seen", timelineController_1.markThreadSeen);
router.post("/threads/:id/restore", timelineController_1.restoreThread);
router.delete("/threads/:id/purge", timelineController_1.purgeThread);
router.post("/threads/reorder", timelineController_1.reorderThreads);
// messages
router.get("/threads/:id/messages", timelineController_1.listMessages);
router.post("/threads/:id/messages", timelineController_1.addMessage);
// media proxy (prevents huge base64 payloads in listMessages)
router.get("/threads/:id/messages/:messageId/media/:kind/:index", timelineController_1.getMessageMedia);
exports.default = router;
