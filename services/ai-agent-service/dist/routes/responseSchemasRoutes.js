"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const responseSchemasController_1 = require("../controllers/responseSchemasController");
const router = express_1.default.Router();
router.get("/", responseSchemasController_1.listResponseSchemas);
router.get("/:id", responseSchemasController_1.getResponseSchema);
router.post("/", responseSchemasController_1.createResponseSchema);
router.put("/:id", responseSchemasController_1.updateResponseSchema);
router.delete("/:id", responseSchemasController_1.deleteResponseSchema);
exports.default = router;
