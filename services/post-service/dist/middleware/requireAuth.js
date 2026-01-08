"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyJwtToken = verifyJwtToken;
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function verifyJwtToken(token) {
    const secret = process.env.JWT_SECRET || "secret";
    return jsonwebtoken_1.default.verify(token, secret);
}
function requireAuth(req, res, next) {
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
        req.userId = String(userId);
        if (decoded?.email)
            req.email = String(decoded.email);
        if (decoded?.tenantId)
            req.tenantId = String(decoded.tenantId);
        return next();
    }
    catch (e) {
        console.error("post-service requireAuth error:", e);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
