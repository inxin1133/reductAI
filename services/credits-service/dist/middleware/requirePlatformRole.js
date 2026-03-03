"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePlatformAdmin = requirePlatformAdmin;
const PLATFORM_ADMIN_SLUGS = new Set(["owner", "admin", "super-admin"]);
function requirePlatformAdmin(req, res, next) {
    const roleSlug = req.platformRole;
    if (!roleSlug || !PLATFORM_ADMIN_SLUGS.has(String(roleSlug))) {
        return res.status(403).json({ message: "Platform admin role required" });
    }
    return next();
}
