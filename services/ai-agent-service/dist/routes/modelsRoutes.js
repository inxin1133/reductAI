"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const modelsController_1 = require("../controllers/modelsController");
const router = express_1.default.Router();
// 시뮬레이터 (동적 라우트(:id)보다 위에 있어야 함)
router.post("/simulate", modelsController_1.simulateModel);
router.post("/reorder", modelsController_1.reorderModels);
// AI 모델 관리
router.get("/", modelsController_1.getModels);
router.get("/:id", modelsController_1.getModel);
router.post("/", modelsController_1.createModel);
router.put("/:id", modelsController_1.updateModel);
router.delete("/:id", modelsController_1.deleteModel);
exports.default = router;
