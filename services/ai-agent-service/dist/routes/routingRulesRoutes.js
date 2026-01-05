"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routingRulesController_1 = require("../controllers/routingRulesController");
const router = express_1.default.Router();
// Admin: model routing rules
router.get("/", routingRulesController_1.listRoutingRules);
router.get("/:id", routingRulesController_1.getRoutingRule);
router.post("/", routingRulesController_1.createRoutingRule);
router.put("/:id", routingRulesController_1.updateRoutingRule);
router.delete("/:id", routingRulesController_1.deleteRoutingRule);
exports.default = router;
