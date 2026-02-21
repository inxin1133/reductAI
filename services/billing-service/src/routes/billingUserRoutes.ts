import express from "express"
import {
  checkoutUserSubscription,
  createMyPaymentMethod,
  getMyCheckoutSummary,
  getMyBillingAccount,
  getMyTaxRate,
  listMyPaymentMethods,
  quoteUserSubscription,
  upsertMyBillingAccount,
} from "../controllers/billingController"

const router = express.Router()

router.get("/billing-account", getMyBillingAccount)
router.put("/billing-account", upsertMyBillingAccount)
router.get("/payment-methods", listMyPaymentMethods)
router.post("/payment-methods", createMyPaymentMethod)
router.get("/tax-rate", getMyTaxRate)
router.post("/quote", quoteUserSubscription)
router.post("/checkout", checkoutUserSubscription)
router.get("/checkout-summary", getMyCheckoutSummary)

export default router
