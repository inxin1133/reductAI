"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const planModelAccessController_1 = require("../controllers/planModelAccessController");
const router = express_1.default.Router();
// 플랜별 모델 접근 관리
router.get("/", planModelAccessController_1.listPlanModelAccess); // ?plan_tier=free|pro|premium|business|enterprise
router.post("/", planModelAccessController_1.createPlanModelAccess);
router.delete("/:id", planModelAccessController_1.deletePlanModelAccessById); // 단건 삭제
router.delete("/", planModelAccessController_1.deletePlanModelAccessByTier); // ?plan_tier=... (전체 삭제 = 모든 모델 허용)
exports.default = router;
