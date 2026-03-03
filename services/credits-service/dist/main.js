"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const creditRoutes_1 = __importDefault(require("./routes/creditRoutes"));
const internalCreditRoutes_1 = __importDefault(require("./routes/internalCreditRoutes"));
const publicCreditRoutes_1 = __importDefault(require("./routes/publicCreditRoutes"));
const requireAuth_1 = require("./middleware/requireAuth");
const requirePlatformRole_1 = require("./middleware/requirePlatformRole");
const requireServiceKey_1 = require("./middleware/requireServiceKey");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3011;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "25mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "25mb" }));
app.use("/api/ai/credits/internal", requireServiceKey_1.requireServiceKey, internalCreditRoutes_1.default);
app.use("/api/ai/credits/my", requireAuth_1.requireAuth, publicCreditRoutes_1.default);
app.use("/api/ai/credits", requireAuth_1.requireAuth, requirePlatformRole_1.requirePlatformAdmin, creditRoutes_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "credits-service" });
});
app.listen(PORT, () => {
    console.log(`credits-service running on port ${PORT}`);
});
