"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const providersController_1 = require("../controllers/providersController");
const router = express_1.default.Router();
// 다른 서비스들과 동일하게, 현재는 인증을 강제하지 않습니다. (추후 authenticate 미들웨어 추가 가능)
router.get("/", providersController_1.getProviders);
router.get("/:id", providersController_1.getProvider);
router.post("/", providersController_1.createProvider);
router.put("/:id", providersController_1.updateProvider);
router.delete("/:id", providersController_1.deleteProvider);
exports.default = router;
