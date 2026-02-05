import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

type AuthPayload = {
  userId?: string
  email?: string
  tenantId?: string
  platformRole?: string
}

export type AuthedRequest = Request & {
  userId: string
  email?: string
  tenantId?: string
  platformRole?: string
}

export function verifyJwtToken(token: string): AuthPayload {
  const secret = process.env.JWT_SECRET || "secret"
  return jwt.verify(token, secret) as AuthPayload
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = String(req.headers.authorization || "")
    const m = header.match(/^Bearer\s+(.+)$/i)
    const token = m?.[1]
    if (!token) return res.status(401).json({ message: "Missing Authorization token" })

    const decoded = verifyJwtToken(token)
    const userId = decoded?.userId
    if (!userId) return res.status(401).json({ message: "Invalid token payload (missing userId)" })

    ;(req as AuthedRequest).userId = String(userId)
    if (decoded?.email) (req as AuthedRequest).email = String(decoded.email)
    if (decoded?.tenantId) (req as AuthedRequest).tenantId = String(decoded.tenantId)
    if (decoded?.platformRole) (req as AuthedRequest).platformRole = String(decoded.platformRole)

    return next()
  } catch (e) {
    console.error("tenant-service requireAuth error:", e)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}

