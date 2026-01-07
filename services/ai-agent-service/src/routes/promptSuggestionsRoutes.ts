import express from "express"
import {
  createPromptSuggestion,
  deletePromptSuggestion,
  getPromptSuggestion,
  listPromptSuggestions,
  updatePromptSuggestion,
} from "../controllers/promptSuggestionsController"

const router = express.Router()

router.get("/", listPromptSuggestions)
router.get("/:id", getPromptSuggestion)
router.post("/", createPromptSuggestion)
router.put("/:id", updatePromptSuggestion)
router.delete("/:id", deletePromptSuggestion)

export default router


