import express from "express"
import {
  applyMySubscriptionChange,
  checkoutUserSubscription,
  createMyPaymentMethod,
  getMyCheckoutSummary,
  getMyBillingAccount,
  getMySubscription,
  getMyTaxRate,
  listMyPaymentMethods,
  quoteMySubscriptionChange,
  quoteUserSubscription,
  upsertMyBillingAccount,
} from "../controllers/billingController"

const router = express.Router()

router.get("/billing-account", getMyBillingAccount)
router.put("/billing-account", upsertMyBillingAccount)
router.get("/payment-methods", listMyPaymentMethods)
router.post("/payment-methods", createMyPaymentMethod)
router.get("/tax-rate", getMyTaxRate)
router.get("/subscription", getMySubscription)
router.post("/subscription-quote", quoteMySubscriptionChange)
router.post("/subscription-change", applyMySubscriptionChange)
router.post("/quote", quoteUserSubscription)
router.post("/checkout", checkoutUserSubscription)
router.get("/checkout-summary", getMyCheckoutSummary)

export default router
