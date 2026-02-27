import express from "express"
import {
  applyMySubscriptionChange,
  cancelMySeatAddon,
  checkoutTopupPurchase,
  checkoutSeatAddonPurchase,
  checkoutUserSubscription,
  createMyPaymentMethod,
  deleteMyPaymentMethod,
  getMyCheckoutSummary,
  getMyBillingAccount,
  getMyInvoiceDetail,
  getMySubscription,
  getMySubscriptionOverview,
  getMyTaxRate,
  listMyInvoices,
  listMyPaymentMethods,
  listMyTransactions,
  quoteMySubscriptionChange,
  quoteSeatAddonPurchase,
  quoteTopupPurchase,
  quoteUserSubscription,
  setMyDefaultPaymentMethod,
  upsertMyBillingAccount,
} from "../controllers/billingController"

const router = express.Router()

router.get("/billing-account", getMyBillingAccount)
router.put("/billing-account", upsertMyBillingAccount)
router.get("/payment-methods", listMyPaymentMethods)
router.post("/payment-methods", createMyPaymentMethod)
router.put("/payment-methods/:id/default", setMyDefaultPaymentMethod)
router.delete("/payment-methods/:id", deleteMyPaymentMethod)
router.get("/tax-rate", getMyTaxRate)
router.get("/subscription", getMySubscription)
router.get("/subscription-overview", getMySubscriptionOverview)
router.post("/subscription-quote", quoteMySubscriptionChange)
router.post("/subscription-change", applyMySubscriptionChange)
router.post("/quote", quoteUserSubscription)
router.post("/checkout", checkoutUserSubscription)
router.post("/topup-quote", quoteTopupPurchase)
router.post("/topup-checkout", checkoutTopupPurchase)
router.post("/seat-addon-quote", quoteSeatAddonPurchase)
router.post("/seat-addon-checkout", checkoutSeatAddonPurchase)
router.post("/seat-addon-cancel", cancelMySeatAddon)
router.get("/checkout-summary", getMyCheckoutSummary)
router.get("/invoices", listMyInvoices)
router.get("/invoices/:id", getMyInvoiceDetail)
router.get("/transactions", listMyTransactions)

export default router
