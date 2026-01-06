import express from "express"
import {
  createModelApiProfile,
  deleteModelApiProfile,
  getModelApiProfile,
  listModelApiProfiles,
  updateModelApiProfile,
} from "../controllers/modelApiProfilesController"

const router = express.Router()

// Admin: model api profiles
router.get("/", listModelApiProfiles)
router.get("/:id", getModelApiProfile)
router.post("/", createModelApiProfile)
router.put("/:id", updateModelApiProfile)
router.delete("/:id", deleteModelApiProfile)

export default router


