import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import systemRoutes from "./routes/systemRoutes"
import { requireAuth } from "./middleware/requireAuth"
import { requirePlatformAdmin } from "./middleware/requirePlatformRole"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3004

app.use(cors())
app.use(express.json({ limit: "25mb" }))
app.use(express.urlencoded({ extended: true, limit: "25mb" }))

app.use("/api/ai/system", requireAuth, requirePlatformAdmin, systemRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "system-service" })
})

app.listen(PORT, () => {
  console.log(`system-service running on port ${PORT}`)
})
