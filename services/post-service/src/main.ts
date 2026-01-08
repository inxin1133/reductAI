import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import postsRoutes from "./routes/postsRoutes"
import blocksRoutes from "./routes/blocksRoutes"

dotenv.config()

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


