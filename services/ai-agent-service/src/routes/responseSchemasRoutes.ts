import express from "express"
import {
  createResponseSchema,
  deleteResponseSchema,
  getResponseSchema,
  listResponseSchemas,
  updateResponseSchema,
} from "../controllers/responseSchemasController"

const router = express.Router()

router.get("/", listResponseSchemas)
router.get("/:id", getResponseSchema)
router.post("/", createResponseSchema)
router.put("/:id", updateResponseSchema)
router.delete("/:id", deleteResponseSchema)

export default router


