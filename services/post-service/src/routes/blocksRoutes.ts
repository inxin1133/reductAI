import express from "express"
import { requireAuth } from "../middleware/requireAuth"
import {
  createBlock,
  deleteBlock,
  listBacklinks,
  listBlocks,
  reorderBlock,
  updateBlock,
} from "../controllers/blocksController"

const router = express.Router()

// block list/create
router.get("/:id/blocks", requireAuth, listBlocks)
router.post("/:id/blocks", requireAuth, createBlock)

// backlinks
router.get("/:id/backlinks", requireAuth, listBacklinks)

// block update/delete/reorder
router.patch("/:id/blocks/:blockId", requireAuth, updateBlock)
router.delete("/:id/blocks/:blockId", requireAuth, deleteBlock)
router.post("/:id/blocks/:blockId/reorder", requireAuth, reorderBlock)

export default router


