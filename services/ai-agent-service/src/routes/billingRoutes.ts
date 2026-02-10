import express from "express"
import {
  createBillingPlan,
  listBillingPlans,
  updateBillingPlan,
  listBillingPlanPrices,
  createBillingPlanPrice,
  updateBillingPlanPrice,
  listTaxRates,
  createTaxRate,
  updateTaxRate,
  listFxRates,
  createFxRate,
  updateFxRate,
  listPaymentProviderConfigs,
  createPaymentProviderConfig,
  updatePaymentProviderConfig,
  listBillingAccounts,
  createBillingAccount,
  updateBillingAccount,
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  listBillingSubscriptions,
  updateBillingSubscription,
  listBillingSubscriptionChanges,
  listBillingInvoices,
  listInvoiceLineItems,
  updateBillingInvoice,
  listPaymentTransactions,
  updatePaymentTransaction,
} from "../controllers/billingController"

const router = express.Router()

router.get("/plans", listBillingPlans)
router.post("/plans", createBillingPlan)
router.put("/plans/:id", updateBillingPlan)
router.get("/plan-prices", listBillingPlanPrices)
router.post("/plan-prices", createBillingPlanPrice)
router.put("/plan-prices/:id", updateBillingPlanPrice)
router.get("/tax-rates", listTaxRates)
router.post("/tax-rates", createTaxRate)
router.put("/tax-rates/:id", updateTaxRate)
router.get("/fx-rates", listFxRates)
router.post("/fx-rates", createFxRate)
router.put("/fx-rates/:id", updateFxRate)
router.get("/payment-provider-configs", listPaymentProviderConfigs)
router.post("/payment-provider-configs", createPaymentProviderConfig)
router.put("/payment-provider-configs/:id", updatePaymentProviderConfig)
router.get("/billing-accounts", listBillingAccounts)
router.post("/billing-accounts", createBillingAccount)
router.put("/billing-accounts/:id", updateBillingAccount)
router.get("/payment-methods", listPaymentMethods)
router.post("/payment-methods", createPaymentMethod)
router.put("/payment-methods/:id", updatePaymentMethod)
router.get("/subscriptions", listBillingSubscriptions)
router.put("/subscriptions/:id", updateBillingSubscription)
router.get("/subscription-changes", listBillingSubscriptionChanges)
router.get("/invoices", listBillingInvoices)
router.get("/invoice-line-items", listInvoiceLineItems)
router.put("/invoices/:id", updateBillingInvoice)
router.get("/transactions", listPaymentTransactions)
router.put("/transactions/:id", updatePaymentTransaction)

export default router
