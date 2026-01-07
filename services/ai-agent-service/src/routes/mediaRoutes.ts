import express from "express"
import { requireAuth, verifyJwtToken } from "../middleware/requireAuth"
import { getMediaAsset } from "../controllers/mediaController"

const router = express.Router()

// Media endpoints are consumed by <img>/<audio>/<video> tags.
// Those requests cannot attach Authorization headers when JWT is stored in localStorage.
// So we accept a fallback `?token=` query param ONLY for this media router.
router.use((req: any, res: any, next: any) => {
  const header = String(req.headers.authorization || "")
  const m = header.match(/^Bearer\s+(.+)$/i)
  const headerToken = m?.[1]
  if (headerToken) return requireAuth(req, res, next)

  const q = req.query as Record<string, unknown>
  const token = typeof q.token === "string" ? q.token : ""
  if (!token) return res.status(401).json({ message: "Missing Authorization token" })
  try {
    const decoded = verifyJwtToken(token)
    const userId = decoded?.userId
    if (!userId) return res.status(401).json({ message: "Invalid token payload (missing userId)" })
    ;(req as any).userId = String(userId)
    if (decoded?.email) (req as any).email = String(decoded.email)
    return next()
  } catch (e) {
    console.error("media auth error:", e)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
})

router.get("/assets/:id", getMediaAsset)

export default router


