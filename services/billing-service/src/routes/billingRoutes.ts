import express from "express"
import {
  createBillingPlan,
  createBillingPlanPrice,
  createBillingAccount,
  createPaymentMethod,
  createPaymentProviderConfig,
  createTaxRate,
  createFxRate,
  getFxSyncStatus,
  getTaxSyncStatus,
  listBillingAccounts,
  listBillingInvoices,
  listInvoiceLineItems,
  listBillingPlans,
  listBillingPlanPrices,
  listBillingSubscriptionChanges,
  listBillingSubscriptions,
  provisionBillingSubscription,
  listPaymentMethods,
  listPaymentProviderConfigs,
  listPaymentTransactions,
  listTaxRates,
  listFxRates,
  syncFxRates,
  syncTaxRates,
  updateBillingAccount,
  updateBillingInvoice,
  updateBillingPlan,
  updateBillingPlanPrice,
  updateBillingSubscription,
  updateFxRate,
  updateFxSyncStatus,
  updatePaymentMethod,
  updatePaymentProviderConfig,
  updatePaymentTransaction,
  updateTaxRate,
  updateTaxSyncStatus,
} from "../controllers/billingController"

const router = express.Router()

// Plans
router.get("/plans", listBillingPlans)
router.post("/plans", createBillingPlan)
router.put("/plans/:id", updateBillingPlan)

// Plan prices
router.get("/plan-prices", listBillingPlanPrices)
router.post("/plan-prices", createBillingPlanPrice)
router.put("/plan-prices/:id", updateBillingPlanPrice)

// Tax/Fx
router.get("/tax-rates", listTaxRates)
router.post("/tax-rates", createTaxRate)
router.put("/tax-rates/:id", updateTaxRate)
router.get("/tax-rates/sync-status", getTaxSyncStatus)
router.put("/tax-rates/sync-status", updateTaxSyncStatus)
router.post("/tax-rates/sync", syncTaxRates)
router.get("/fx-rates", listFxRates)
router.post("/fx-rates", createFxRate)
router.put("/fx-rates/:id", updateFxRate)
router.get("/fx-rates/sync-status", getFxSyncStatus)
router.put("/fx-rates/sync-status", updateFxSyncStatus)
router.post("/fx-rates/sync", syncFxRates)

// Provider configs
router.get("/payment-provider-configs", listPaymentProviderConfigs)
router.post("/payment-provider-configs", createPaymentProviderConfig)
router.put("/payment-provider-configs/:id", updatePaymentProviderConfig)

// Billing accounts
router.get("/billing-accounts", listBillingAccounts)
router.post("/billing-accounts", createBillingAccount)
router.put("/billing-accounts/:id", updateBillingAccount)

// Payment methods
router.get("/payment-methods", listPaymentMethods)
router.post("/payment-methods", createPaymentMethod)
router.put("/payment-methods/:id", updatePaymentMethod)

// Subscriptions
router.get("/subscriptions", listBillingSubscriptions)
router.post("/subscriptions/provision", provisionBillingSubscription)
router.put("/subscriptions/:id", updateBillingSubscription)
router.get("/subscription-changes", listBillingSubscriptionChanges)

// Invoices
router.get("/invoices", listBillingInvoices)
router.put("/invoices/:id", updateBillingInvoice)
router.get("/invoice-line-items", listInvoiceLineItems)

// Transactions
router.get("/transactions", listPaymentTransactions)
router.put("/transactions/:id", updatePaymentTransaction)

export default router
