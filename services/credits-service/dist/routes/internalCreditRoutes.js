"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const creditController_1 = require("../controllers/creditController");
const router = express_1.default.Router();
router.post("/subscription-grant", creditController_1.grantSubscriptionCredits);
router.post("/deduct-for-usage", creditController_1.deductCreditsForUsage);
router.post("/check-can-consume", creditController_1.checkCanConsume);
exports.default = router;
