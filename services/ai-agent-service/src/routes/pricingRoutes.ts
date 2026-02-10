import express from "express"
import {
  listPublicPrices,
  listRateCards,
  createRateCard,
  updateRateCard,
  cloneRateCard,
  listRates,
  updateRate,
  bulkUpdateRates,
  listMarkups,
  createMarkup,
  updateMarkup,
  deleteMarkup,
} from "../controllers/pricingController"

const router = express.Router()

// Admin: public price table (read-only)
router.get("/public-prices", listPublicPrices)
router.get("/rate-cards", listRateCards)
router.post("/rate-cards", createRateCard)
router.put("/rate-cards/:id", updateRateCard)
router.post("/rate-cards/:id/clone", cloneRateCard)
router.get("/rates", listRates)
router.put("/rates/:id", updateRate)
router.post("/rates/bulk-update", bulkUpdateRates)
router.get("/markups", listMarkups)
router.post("/markups", createMarkup)
router.put("/markups/:id", updateMarkup)
router.delete("/markups/:id", deleteMarkup)

export default router

