import express from "express"
import {
  getCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
} from "../controllers/credentialsController"
import { testSora2Access } from "../controllers/credentialTestController"

const router = express.Router()

// 다른 서비스들과 동일하게, 현재는 인증을 강제하지 않습니다. (추후 authenticate 미들웨어 추가 가능)
router.get("/", getCredentials)
router.get("/:id", getCredential)
router.post("/", createCredential)
router.put("/:id", updateCredential)
router.delete("/:id", deleteCredential)
// Test whether this credential can see / access Sora models (e.g. sora-2)
router.get("/:id/test-sora", testSora2Access)

export default router


