"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const tenantTypeModelAccessController_1 = require("../controllers/tenantTypeModelAccessController");
const router = express_1.default.Router();
// 테넌트 "유형"별 모델 접근 권한 관리
router.get("/", tenantTypeModelAccessController_1.getTypeModelAccess); // ?tenant_type=personal|team|enterprise
router.get("/:id", tenantTypeModelAccessController_1.getTypeModelAccessItem);
router.post("/", tenantTypeModelAccessController_1.createTypeModelAccess);
router.put("/:id", tenantTypeModelAccessController_1.updateTypeModelAccess);
router.delete("/:id", tenantTypeModelAccessController_1.deleteTypeModelAccess);
exports.default = router;
