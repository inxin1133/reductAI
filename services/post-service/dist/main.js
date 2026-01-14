"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const postsRoutes_1 = __importDefault(require("./routes/postsRoutes"));
const blocksRoutes_1 = __importDefault(require("./routes/blocksRoutes"));
const schemaEnsure_1 = require("./services/schemaEnsure");
dotenv_1.default.config();
async function start() {
    // Self-heal DB schema (important for dev environments where only 일부 테이블/컬럼이 초기화됨)
    try {
        await (0, schemaEnsure_1.ensurePostEditorSchema)();
    }
    catch (e) {
        console.error("post-service schema ensure failed:", e);
    }
    const app = (0, express_1.default)();
    const PORT = process.env.PORT || 3005;
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: "5mb" }));
    app.use("/api/posts", postsRoutes_1.default);
    app.use("/api/posts", blocksRoutes_1.default);
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", service: "post-service" });
    });
    app.listen(PORT, () => {
        console.log(`post-service running on port ${PORT}`);
    });
}
void start();
