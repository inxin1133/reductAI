"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const modelApiProfilesController_1 = require("../controllers/modelApiProfilesController");
const router = express_1.default.Router();
// Admin: model api profiles
router.get("/", modelApiProfilesController_1.listModelApiProfiles);
router.get("/:id", modelApiProfilesController_1.getModelApiProfile);
router.post("/", modelApiProfilesController_1.createModelApiProfile);
router.put("/:id", modelApiProfilesController_1.updateModelApiProfile);
router.delete("/:id", modelApiProfilesController_1.deleteModelApiProfile);
exports.default = router;
