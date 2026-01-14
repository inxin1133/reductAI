import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import postsRoutes from "./routes/postsRoutes"
import blocksRoutes from "./routes/blocksRoutes"
import { ensurePostEditorSchema } from "./services/schemaEnsure"

dotenv.config()

async function start() {
  // Self-heal DB schema (important for dev environments where only 일부 테이블/컬럼이 초기화됨)
  try {
    await ensurePostEditorSchema()
  } catch (e) {
    console.error("post-service schema ensure failed:", e)
  }

  const app = express()
  const PORT = process.env.PORT || 3005

  app.use(cors())
  app.use(express.json({ limit: "5mb" }))

  app.use("/api/posts", postsRoutes)
  app.use("/api/posts", blocksRoutes)

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "post-service" })
  })

  app.listen(PORT, () => {
    console.log(`post-service running on port ${PORT}`)
  })
}

void start()


