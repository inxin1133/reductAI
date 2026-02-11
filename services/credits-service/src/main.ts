import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import creditRoutes from "./routes/creditRoutes"
import { requireAuth } from "./middleware/requireAuth"
import { requirePlatformAdmin } from "./middleware/requirePlatformRole"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3011

app.use(cors())
app.use(express.json({ limit: "25mb" }))
app.use(express.urlencoded({ extended: true, limit: "25mb" }))

app.use("/api/ai/credits", requireAuth, requirePlatformAdmin, creditRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "credits-service" })
})

app.listen(PORT, () => {
  console.log(`credits-service running on port ${PORT}`)
})
