import { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

// auth-service와 동일한 payload 형태를 가정합니다.
// auth-service/src/controllers/authController.ts:
//   jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, ...)
type AuthPayload = {
  userId?: string
  email?: string
}

export type AuthedRequest = Request & {
  userId: string
  email?: string
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || ""
    const m = header.match(/^Bearer\s+(.+)$/i)
    const token = m?.[1]
    if (!token) return res.status(401).json({ message: "Missing Authorization token" })

    // auth-service도 기본값을 'secret'으로 사용하므로 동일하게 맞춥니다.
    const secret = process.env.JWT_SECRET || "secret"
    const decoded = jwt.verify(token, secret) as AuthPayload

    const userId = decoded?.userId
    if (!userId) return res.status(401).json({ message: "Invalid token payload (missing userId)" })

    ;(req as AuthedRequest).userId = String(userId)
    if (decoded?.email) (req as AuthedRequest).email = String(decoded.email)

    return next()
  } catch (e) {
    console.error("requireAuth error:", e)
    return res.status(401).json({ message: "Invalid or expired token" })
  }
}


