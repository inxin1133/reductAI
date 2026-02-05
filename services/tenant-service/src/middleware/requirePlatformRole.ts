import type { NextFunction, Request, Response } from "express"
import pool from "../config/db"
import type { AuthedRequest } from "./requireAuth"

const PLATFORM_ADMIN_SLUGS = new Set(["owner", "admin", "super-admin"])

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as AuthedRequest).userId
    if (!userId) return res.status(401).json({ message: "Missing userId in auth context" })

    const { rows } = await pool.query(
      `
        SELECT r.slug
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
          AND r.scope = 'platform'
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        ORDER BY ur.granted_at DESC NULLS LAST
        LIMIT 1
      `,
      [userId]
    )

    const roleSlug = rows[0]?.slug
    if (!roleSlug || !PLATFORM_ADMIN_SLUGS.has(String(roleSlug))) {
      return res.status(403).json({ message: "Platform admin role required" })
    }

    ;(req as AuthedRequest).platformRole = String(roleSlug)
    return next()
  } catch (error) {
    console.error("tenant-service requirePlatformAdmin error:", error)
    return res.status(500).json({ message: "Failed to verify platform role" })
  }
}

