"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const m = header.match(/^Bearer\s+(.+)$/i);
        const token = m?.[1];
        if (!token)
            return res.status(401).json({ message: "Missing Authorization token" });
        // auth-service도 기본값을 'secret'으로 사용하므로 동일하게 맞춥니다.
        const secret = process.env.JWT_SECRET || "secret";
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        const userId = decoded?.userId;
        if (!userId)
            return res.status(401).json({ message: "Invalid token payload (missing userId)" });
        req.userId = String(userId);
        if (decoded?.email)
            req.email = String(decoded.email);
        return next();
    }
    catch (e) {
        console.error("requireAuth error:", e);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
