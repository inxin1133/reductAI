"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const credentialsController_1 = require("../controllers/credentialsController");
const credentialTestController_1 = require("../controllers/credentialTestController");
const router = express_1.default.Router();
// 다른 서비스들과 동일하게, 현재는 인증을 강제하지 않습니다. (추후 authenticate 미들웨어 추가 가능)
router.get("/", credentialsController_1.getCredentials);
router.get("/:id", credentialsController_1.getCredential);
router.post("/", credentialsController_1.createCredential);
router.put("/:id", credentialsController_1.updateCredential);
router.delete("/:id", credentialsController_1.deleteCredential);
// Test whether this credential can see / access Sora models (e.g. sora-2)
router.get("/:id/test-sora", credentialTestController_1.testSora2Access);
exports.default = router;
