"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webSearchSettingsController_1 = require("../controllers/webSearchSettingsController");
const router = express_1.default.Router();
// Admin-only settings (currently no auth enforced)
router.get("/", webSearchSettingsController_1.getWebSearchSettings);
router.put("/", webSearchSettingsController_1.updateWebSearchSettings);
exports.default = router;
