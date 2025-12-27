import express from "express"
import {
  getModels,
  getModel,
  createModel,
  updateModel,
  deleteModel,
  simulateModel,
} from "../controllers/modelsController"

const router = express.Router()

// 시뮬레이터 (동적 라우트(:id)보다 위에 있어야 함)
router.post("/simulate", simulateModel)

// AI 모델 관리
router.get("/", getModels)
router.get("/:id", getModel)
router.post("/", createModel)
router.put("/:id", updateModel)
router.delete("/:id", deleteModel)

export default router


