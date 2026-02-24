import type { NextFunction, Request, Response } from "express"
import crypto from "crypto"
import jwt from "jsonwebtoken"
import { query } from "../config/db"

type AuthPayload = {
  userId?: string
  email?: string
  tenantId?: string
}

export type AuthedRequest = Request & {
  userId: string
  email?: string
  tenantId?: string
  sessionTokenHash?: string
}

export function verifyJwtToken(token: string): AuthPayload {
  const secret = process.env.JWT_SECRET || "secret"
  return jwt.verify(token, secret) as AuthPayload
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = String(req.headers.authorization || "")
    const m = header.match(/^Bearer\s+(.+)$/i)
    const token = m?.[1]
    if (!token) return res.status(401).json({ message: "Missing Authorization token" })

    const decoded = verifyJwtToken(token)
    const userId = decoded?.userId
    if (!userId) return res.status(401).json({ message: "Invalid token payload (missing userId)" })

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
    const sessionRes = await query(
      `
      SELECT id, expires_at
      FROM user_sessions
      WHERE token_hash = $1 AND user_id = $2
      LIMIT 1
      `,
      [tokenHash, String(userId)]
    )
    if (sessionRes.rows.length === 0) {
      return res.status(401).json({ message: "Session expired. Please log in again." })
    }
    const expiresAt = sessionRes.rows[0]?.expires_at ? new Date(sessionRes.rows[0].expires_at) : null
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return res.status(401).json({ message: "Session expired. Please log in again." })
    }

    ;(req as AuthedRequest).userId = String(userId)
    if (decoded?.email) (req as AuthedRequest).email = String(decoded.email)
    if (decoded?.tenantId) (req as AuthedRequest).tenantId = String(decoded.tenantId)
    ;(req as AuthedRequest).sessionTokenHash = tokenHash

    await query(`UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`, [
      sessionRes.rows[0].id,
    ])
    return next()
  } catch (e) {
    console.error("post-service requireAuth error:", e)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}


