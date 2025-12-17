import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import languageRoutes from "./routes/languageRoutes"
import namespaceRoutes from "./routes/namespaceRoutes"
import translationRoutes from "./routes/translationRoutes"
import historyRoutes from "./routes/historyRoutes"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3006

app.use(cors())
app.use(express.json())

app.use("/api/i18n/languages", languageRoutes)
app.use("/api/i18n/namespaces", namespaceRoutes)
app.use("/api/i18n/translations", translationRoutes)
app.use("/api/i18n/history", historyRoutes)

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "i18n-service" })
})

app.listen(PORT, () => {
  console.log(`i18n-service running on port ${PORT}`)
})

