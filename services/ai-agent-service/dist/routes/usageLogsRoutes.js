"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const usageLogsController_1 = require("../controllers/usageLogsController");
const router = express_1.default.Router();
// Admin: model usage logs
router.get("/", usageLogsController_1.listUsageLogs);
router.get("/:id", usageLogsController_1.getUsageLog);
exports.default = router;
