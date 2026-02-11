import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import pricingRoutes from "./routes/pricingRoutes"
import { requireAuth } from "./middleware/requireAuth"
import { requirePlatformAdmin } from "./middleware/requirePlatformRole"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3009

app.use(cors())
app.use(express.json({ limit: "25mb" }))
app.use(express.urlencoded({ extended: true, limit: "25mb" }))

app.use("/api/ai/pricing", requireAuth, requirePlatformAdmin, pricingRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "pricing-service" })
})

app.listen(PORT, () => {
  console.log(`pricing-service running on port ${PORT}`)
})
