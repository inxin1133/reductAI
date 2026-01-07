"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promptSuggestionsController_1 = require("../controllers/promptSuggestionsController");
const router = express_1.default.Router();
router.get("/", promptSuggestionsController_1.listPromptSuggestions);
router.get("/:id", promptSuggestionsController_1.getPromptSuggestion);
router.post("/", promptSuggestionsController_1.createPromptSuggestion);
router.put("/:id", promptSuggestionsController_1.updatePromptSuggestion);
router.delete("/:id", promptSuggestionsController_1.deletePromptSuggestion);
exports.default = router;
