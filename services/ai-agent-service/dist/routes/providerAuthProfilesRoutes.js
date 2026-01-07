"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const providerAuthProfilesController_1 = require("../controllers/providerAuthProfilesController");
const router = express_1.default.Router();
// Admin: provider auth profiles
router.get("/", providerAuthProfilesController_1.listProviderAuthProfiles);
router.get("/:id", providerAuthProfilesController_1.getProviderAuthProfile);
router.post("/", providerAuthProfilesController_1.createProviderAuthProfile);
router.put("/:id", providerAuthProfilesController_1.updateProviderAuthProfile);
router.delete("/:id", providerAuthProfilesController_1.deleteProviderAuthProfile);
exports.default = router;
