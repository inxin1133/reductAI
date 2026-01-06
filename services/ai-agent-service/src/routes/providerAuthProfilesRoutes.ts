import express from "express"
import {
  createProviderAuthProfile,
  deleteProviderAuthProfile,
  getProviderAuthProfile,
  listProviderAuthProfiles,
  updateProviderAuthProfile,
} from "../controllers/providerAuthProfilesController"

const router = express.Router()

// Admin: provider auth profiles
router.get("/", listProviderAuthProfiles)
router.get("/:id", getProviderAuthProfile)
router.post("/", createProviderAuthProfile)
router.put("/:id", updateProviderAuthProfile)
router.delete("/:id", deleteProviderAuthProfile)

export default router


