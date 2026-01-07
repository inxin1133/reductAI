"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middleware/requireAuth");
const mediaController_1 = require("../controllers/mediaController");
const router = express_1.default.Router();
// Media endpoints are consumed by <img>/<audio>/<video> tags.
// Those requests cannot attach Authorization headers when JWT is stored in localStorage.
// So we accept a fallback `?token=` query param ONLY for this media router.
router.use((req, res, next) => {
    const header = String(req.headers.authorization || "");
    const m = header.match(/^Bearer\s+(.+)$/i);
    const headerToken = m?.[1];
    if (headerToken)
        return (0, requireAuth_1.requireAuth)(req, res, next);
    const q = req.query;
    const token = typeof q.token === "string" ? q.token : "";
    if (!token)
        return res.status(401).json({ message: "Missing Authorization token" });
    try {
        const decoded = (0, requireAuth_1.verifyJwtToken)(token);
        const userId = decoded?.userId;
        if (!userId)
            return res.status(401).json({ message: "Invalid token payload (missing userId)" });
        req.userId = String(userId);
        if (decoded?.email)
            req.email = String(decoded.email);
        return next();
    }
    catch (e) {
        console.error("media auth error:", e);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
});
router.get("/assets/:id", mediaController_1.getMediaAsset);
exports.default = router;
