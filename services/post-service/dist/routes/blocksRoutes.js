"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middleware/requireAuth");
const blocksController_1 = require("../controllers/blocksController");
const router = express_1.default.Router();
// block list/create
router.get("/:id/blocks", requireAuth_1.requireAuth, blocksController_1.listBlocks);
router.post("/:id/blocks", requireAuth_1.requireAuth, blocksController_1.createBlock);
// backlinks
router.get("/:id/backlinks", requireAuth_1.requireAuth, blocksController_1.listBacklinks);
// block update/delete/reorder
router.patch("/:id/blocks/:blockId", requireAuth_1.requireAuth, blocksController_1.updateBlock);
router.delete("/:id/blocks/:blockId", requireAuth_1.requireAuth, blocksController_1.deleteBlock);
router.post("/:id/blocks/:blockId/reorder", requireAuth_1.requireAuth, blocksController_1.reorderBlock);
exports.default = router;
