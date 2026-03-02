import express from "express"
import {
  addRatesToCard,
  bulkUpdateRates,
  checkModelNeedsSkuGeneration,
  checkSkuCodeAvailability,
  cloneRateCard,
  createMarkup,
  createRateCard,
  createSku,
  deleteMarkup,
  deleteSku,
  generateSkusForModel,
  listMarkups,
  listMissingSkus,
  listPublicPrices,
  listRateCards,
  listRates,
  listSkus,
  updateMarkup,
  updateRate,
  updateRateCard,
  updateSku,
} from "../controllers/pricingController"

const router = express.Router()

router.get("/public-prices", listPublicPrices)
router.get("/rate-cards", listRateCards)
router.post("/rate-cards", createRateCard)
router.put("/rate-cards/:id", updateRateCard)
router.post("/rate-cards/:id/clone", cloneRateCard)
router.get("/rate-cards/:id/missing-skus", listMissingSkus)
router.post("/rate-cards/:id/add-rates", addRatesToCard)
router.get("/rates", listRates)
router.put("/rates/:id", updateRate)
router.post("/rates/bulk-update", bulkUpdateRates)
router.get("/skus", listSkus)
router.get("/skus/check-availability", checkSkuCodeAvailability)
router.get("/skus/needs-generation", checkModelNeedsSkuGeneration)
router.post("/skus", createSku)
router.put("/skus/:id", updateSku)
router.delete("/skus/:id", deleteSku)
router.post("/skus/generate-for-model", generateSkusForModel)
router.get("/markups", listMarkups)
router.post("/markups", createMarkup)
router.put("/markups/:id", updateMarkup)
router.delete("/markups/:id", deleteMarkup)

export default router
