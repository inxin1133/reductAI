import express from "express"
import {
  getModels,
  getModel,
  createModel,
  updateModel,
  softDeleteModel,
  syncModels,
  simulateModel,
} from "../controllers/modelsController"

const router = express.Router()

// 동기화/시뮬레이터 (동적 라우트(:id)보다 위에 있어야 함)
router.post("/sync", syncModels)
router.post("/simulate", simulateModel)

// AI 모델 관리
router.get("/", getModels)
router.get("/:id", getModel)
router.post("/", createModel)
router.put("/:id", updateModel)
router.delete("/:id", softDeleteModel) // 운영 안정성을 위해 soft delete로 처리

export default router


