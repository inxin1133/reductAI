import express from "express"
import {
  bulkUpdateRates,
  cloneRateCard,
  createMarkup,
  createRateCard,
  deleteMarkup,
  listMarkups,
  listPublicPrices,
  listRateCards,
  listRates,
  updateMarkup,
  updateRate,
  updateRateCard,
} from "../controllers/pricingController"

const router = express.Router()

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
