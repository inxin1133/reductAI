"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatUiController_1 = require("../controllers/chatUiController");
const requireAuth_1 = require("../middleware/requireAuth");
const router = express_1.default.Router();
router.get("/config", chatUiController_1.getChatUiConfig);
router.get("/prompt-suggestions", requireAuth_1.requireAuth, chatUiController_1.getChatPromptSuggestions);
exports.default = router;
