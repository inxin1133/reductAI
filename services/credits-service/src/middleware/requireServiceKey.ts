import type { NextFunction, Request, Response } from "express"

export function requireServiceKey(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.CREDITS_SERVICE_KEY || "")
  if (!expected) {
    return res.status(500).json({ message: "CREDITS_SERVICE_KEY is not configured" })
  }
  const provided = String(req.headers["x-service-key"] || "")
  if (!provided || provided !== expected) {
    return res.status(401).json({ message: "Invalid service key" })
  }
  return next()
}
