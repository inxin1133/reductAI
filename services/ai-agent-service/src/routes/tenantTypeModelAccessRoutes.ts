import express from "express"
import {
  getTypeModelAccess,
  getTypeModelAccessItem,
  createTypeModelAccess,
  updateTypeModelAccess,
  deleteTypeModelAccess,
} from "../controllers/tenantTypeModelAccessController"

const router = express.Router()

// 테넌트 "유형"별 모델 접근 권한 관리
router.get("/", getTypeModelAccess) // ?tenant_type=personal|team|enterprise
router.get("/:id", getTypeModelAccessItem)
router.post("/", createTypeModelAccess)
router.put("/:id", updateTypeModelAccess)
router.delete("/:id", deleteTypeModelAccess)

export default router


