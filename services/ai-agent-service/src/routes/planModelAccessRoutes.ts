import express from "express"
import {
  listPlanModelAccess,
  createPlanModelAccess,
  deletePlanModelAccessById,
  deletePlanModelAccessByTier,
} from "../controllers/planModelAccessController"

const router = express.Router()

// 플랜별 모델 접근 관리
router.get("/", listPlanModelAccess) // ?plan_tier=free|pro|premium|business|enterprise
router.post("/", createPlanModelAccess)
router.delete("/:id", deletePlanModelAccessById) // 단건 삭제
router.delete("/", deletePlanModelAccessByTier) // ?plan_tier=... (전체 삭제 = 모든 모델 허용)

export default router
