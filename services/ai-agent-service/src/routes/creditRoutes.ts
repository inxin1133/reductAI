import express from "express"
import {
  createTopupProduct,
  listTopupProducts,
  updateTopupProduct,
  listPlanGrants,
  createPlanGrant,
  updatePlanGrant,
  listCreditTransfers,
  listCreditAccounts,
  updateCreditAccount,
  listCreditLedgerEntries,
  listCreditUsageAllocations,
} from "../controllers/creditController"

const router = express.Router()

router.get("/topup-products", listTopupProducts)
router.post("/topup-products", createTopupProduct)
router.put("/topup-products/:id", updateTopupProduct)
router.get("/plan-grants", listPlanGrants)
router.post("/plan-grants", createPlanGrant)
router.put("/plan-grants/:id", updatePlanGrant)
router.get("/transfers", listCreditTransfers)
router.get("/accounts", listCreditAccounts)
router.put("/accounts/:id", updateCreditAccount)
router.get("/ledger-entries", listCreditLedgerEntries)
router.get("/usage-allocations", listCreditUsageAllocations)

export default router
