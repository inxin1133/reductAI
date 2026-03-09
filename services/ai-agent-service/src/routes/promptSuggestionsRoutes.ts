import express from "express"
import {
  createPromptSuggestion,
  deletePromptSuggestion,
  getPromptSuggestion,
  listPromptSuggestions,
  reorderPromptSuggestions,
  updatePromptSuggestion,
} from "../controllers/promptSuggestionsController"

const router = express.Router()

router.get("/", listPromptSuggestions)
router.post("/reorder", reorderPromptSuggestions)
router.get("/:id", getPromptSuggestion)
router.post("/", createPromptSuggestion)
router.put("/:id", updatePromptSuggestion)
router.delete("/:id", deletePromptSuggestion)

export default router


