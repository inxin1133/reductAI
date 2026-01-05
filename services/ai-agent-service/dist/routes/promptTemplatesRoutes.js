"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promptTemplatesController_1 = require("../controllers/promptTemplatesController");
const router = express_1.default.Router();
// Admin: prompt templates
router.get("/", promptTemplatesController_1.listPromptTemplates);
router.get("/:id", promptTemplatesController_1.getPromptTemplate);
router.post("/", promptTemplatesController_1.createPromptTemplate);
router.put("/:id", promptTemplatesController_1.updatePromptTemplate);
router.delete("/:id", promptTemplatesController_1.deletePromptTemplate);
exports.default = router;
