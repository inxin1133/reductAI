import express from "express"
import {
  listServices,
  createService,
  updateService,
  listServiceInstances,
  createServiceInstance,
  updateServiceInstance,
  listTenantServiceAccess,
  createTenantServiceAccess,
  updateTenantServiceAccess,
} from "../controllers/servicesController"
import { listUserSessions, revokeUserSession } from "../controllers/securityController"
import { listAuditLogs } from "../controllers/auditController"

const router = express.Router()

router.get("/services", listServices)
router.post("/services", createService)
router.put("/services/:id", updateService)

router.get("/service-instances", listServiceInstances)
router.post("/service-instances", createServiceInstance)
router.put("/service-instances/:id", updateServiceInstance)

router.get("/tenant-service-access", listTenantServiceAccess)
router.post("/tenant-service-access", createTenantServiceAccess)
router.put("/tenant-service-access/:id", updateTenantServiceAccess)

router.get("/sessions", listUserSessions)
router.delete("/sessions/:id", revokeUserSession)

router.get("/audit-logs", listAuditLogs)

export default router
