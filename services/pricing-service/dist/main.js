"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const pricingRoutes_1 = __importDefault(require("./routes/pricingRoutes"));
const requireAuth_1 = require("./middleware/requireAuth");
const requirePlatformRole_1 = require("./middleware/requirePlatformRole");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3009;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "25mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "25mb" }));
app.use("/api/ai/pricing", requireAuth_1.requireAuth, requirePlatformRole_1.requirePlatformAdmin, pricingRoutes_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "pricing-service" });
});
app.listen(PORT, () => {
    console.log(`pricing-service running on port ${PORT}`);
});
