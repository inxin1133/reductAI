import express from "express"
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from "../controllers/languageController"

const router = express.Router()

// GET은 개발 편의상 공개, 나머지는 인증 유지가 필요하면 추후 추가
router.get("/", getLanguages)
router.post("/", createLanguage)
router.put("/:id", updateLanguage)
router.delete("/:id", deleteLanguage)

export default router

