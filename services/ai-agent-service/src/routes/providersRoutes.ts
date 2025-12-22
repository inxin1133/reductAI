import express from "express"
import {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
} from "../controllers/providersController"

const router = express.Router()

// 다른 서비스들과 동일하게, 현재는 인증을 강제하지 않습니다. (추후 authenticate 미들웨어 추가 가능)
router.get("/", getProviders)
router.get("/:id", getProvider)
router.post("/", createProvider)
router.put("/:id", updateProvider)
router.delete("/:id", deleteProvider)

export default router


