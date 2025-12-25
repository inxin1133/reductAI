import express from "express"
import {
  createRoutingRule,
  deleteRoutingRule,
  getRoutingRule,
  listRoutingRules,
  updateRoutingRule,
} from "../controllers/routingRulesController"

const router = express.Router()

// Admin: model routing rules
router.get("/", listRoutingRules)
router.get("/:id", getRoutingRule)
router.post("/", createRoutingRule)
router.put("/:id", updateRoutingRule)
router.delete("/:id", deleteRoutingRule)

export default router


