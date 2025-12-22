import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import providersRoutes from "./routes/providersRoutes"
import credentialsRoutes from "./routes/credentialsRoutes"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3007

app.use(cors())
app.use(express.json())

// AI Providers / Credentials 관리 API
// - Admin 화면에서 사용하는 설정 API
app.use("/api/ai/providers", providersRoutes)
app.use("/api/ai/credentials", credentialsRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-agent-service" })
})

app.listen(PORT, () => {
  console.log(`ai-agent-service running on port ${PORT}`)
})


