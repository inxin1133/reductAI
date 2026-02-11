import type { NextFunction, Request, Response } from "express"
import type { AuthedRequest } from "./requireAuth"

const PLATFORM_ADMIN_SLUGS = new Set(["owner", "admin", "super-admin"])

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  const roleSlug = (req as AuthedRequest).platformRole
  if (!roleSlug || !PLATFORM_ADMIN_SLUGS.has(String(roleSlug))) {
    return res.status(403).json({ message: "Platform admin role required" })
  }
  return next()
}
