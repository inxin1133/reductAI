import express from "express"
import {
  createPromptTemplate,
  deletePromptTemplate,
  getPromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
} from "../controllers/promptTemplatesController"

const router = express.Router()

// Admin: prompt templates
router.get("/", listPromptTemplates)
router.get("/:id", getPromptTemplate)
router.post("/", createPromptTemplate)
router.put("/:id", updatePromptTemplate)
router.delete("/:id", deletePromptTemplate)

export default router


