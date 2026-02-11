import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import billingRoutes from "./routes/billingRoutes"
import { requireAuth } from "./middleware/requireAuth"
import { requirePlatformAdmin } from "./middleware/requirePlatformRole"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3010

app.use(cors())
app.use(express.json({ limit: "25mb" }))
app.use(express.urlencoded({ extended: true, limit: "25mb" }))

app.use("/api/ai/billing", requireAuth, requirePlatformAdmin, billingRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "billing-service" })
})

app.listen(PORT, () => {
  console.log(`billing-service running on port ${PORT}`)
})
