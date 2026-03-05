"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyJwtToken = verifyJwtToken;
exports.requireAuth = requireAuth;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
function verifyJwtToken(token) {
    const secret = process.env.JWT_SECRET || "secret";
    return jsonwebtoken_1.default.verify(token, secret);
}
async function requireAuth(req, res, next) {
    try {
        const header = String(req.headers.authorization || "");
        const m = header.match(/^Bearer\s+(.+)$/i);
        const token = m?.[1];
        if (!token)
            return res.status(401).json({ message: "Missing Authorization token" });
        const decoded = verifyJwtToken(token);
        const userId = decoded?.userId;
        if (!userId)
            return res.status(401).json({ message: "Invalid token payload (missing userId)" });
        const tokenHash = crypto_1.default.createHash("sha256").update(token).digest("hex");
        const sessionRes = await (0, db_1.query)(`
      SELECT id, expires_at
      FROM user_sessions
      WHERE token_hash = $1 AND user_id = $2
      LIMIT 1
      `, [tokenHash, String(userId)]);
        if (sessionRes.rows.length === 0) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }
        const expiresAt = sessionRes.rows[0]?.expires_at ? new Date(sessionRes.rows[0].expires_at) : null;
        if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }
        ;
        req.userId = String(userId);
        if (decoded?.email)
            req.email = String(decoded.email);
        if (decoded?.tenantId)
            req.tenantId = String(decoded.tenantId);
        req.sessionTokenHash = tokenHash;
        await (0, db_1.query)(`UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`, [
            sessionRes.rows[0].id,
        ]);
        return next();
    }
    catch (e) {
        console.error("post-service requireAuth error:", e);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
