"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const providersRoutes_1 = __importDefault(require("./routes/providersRoutes"));
const credentialsRoutes_1 = __importDefault(require("./routes/credentialsRoutes"));
const modelsRoutes_1 = __importDefault(require("./routes/modelsRoutes"));
const tenantTypeModelAccessRoutes_1 = __importDefault(require("./routes/tenantTypeModelAccessRoutes"));
const schemaBootstrap_1 = require("./services/schemaBootstrap");
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const chatUiRoutes_1 = __importDefault(require("./routes/chatUiRoutes"));
const timelineRoutes_1 = __importDefault(require("./routes/timelineRoutes"));
const mediaRoutes_1 = __importDefault(require("./routes/mediaRoutes"));
const usageLogsRoutes_1 = __importDefault(require("./routes/usageLogsRoutes"));
const routingRulesRoutes_1 = __importDefault(require("./routes/routingRulesRoutes"));
const promptTemplatesRoutes_1 = __importDefault(require("./routes/promptTemplatesRoutes"));
const responseSchemasRoutes_1 = __importDefault(require("./routes/responseSchemasRoutes"));
const promptSuggestionsRoutes_1 = __importDefault(require("./routes/promptSuggestionsRoutes"));
const modelApiProfilesRoutes_1 = __importDefault(require("./routes/modelApiProfilesRoutes"));
const providerAuthProfilesRoutes_1 = __importDefault(require("./routes/providerAuthProfilesRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3007;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// AI Providers / Credentials 관리 API
// - Admin 화면에서 사용하는 설정 API
app.use("/api/ai/providers", providersRoutes_1.default);
app.use("/api/ai/credentials", credentialsRoutes_1.default);
app.use("/api/ai/models", modelsRoutes_1.default);
app.use("/api/ai/model-access-by-type", tenantTypeModelAccessRoutes_1.default);
app.use("/api/ai/chat", chatRoutes_1.default);
app.use("/api/ai/chat-ui", chatUiRoutes_1.default);
app.use("/api/ai/timeline", timelineRoutes_1.default);
app.use("/api/ai/media", mediaRoutes_1.default);
app.use("/api/ai/usage-logs", usageLogsRoutes_1.default);
app.use("/api/ai/routing-rules", routingRulesRoutes_1.default);
app.use("/api/ai/prompt-templates", promptTemplatesRoutes_1.default);
app.use("/api/ai/response-schemas", responseSchemasRoutes_1.default);
app.use("/api/ai/prompt-suggestions", promptSuggestionsRoutes_1.default);
app.use("/api/ai/model-api-profiles", modelApiProfilesRoutes_1.default);
app.use("/api/ai/provider-auth-profiles", providerAuthProfilesRoutes_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "ai-agent-service" });
});
app.listen(PORT, async () => {
    // 서비스 부팅 시 필요한 테이블이 없으면 생성
    // (운영에서는 migration 적용 권장)
    try {
        await (0, schemaBootstrap_1.ensureAiAccessSchema)();
        await (0, schemaBootstrap_1.ensureTimelineSchema)();
        await (0, schemaBootstrap_1.ensureMessageMediaAssetsSchema)();
        await (0, schemaBootstrap_1.ensureModelUsageLogsSchema)();
        await (0, schemaBootstrap_1.ensureModelRoutingRulesSchema)();
        await (0, schemaBootstrap_1.ensurePromptTemplatesSchema)();
        await (0, schemaBootstrap_1.ensureResponseSchemasSchema)();
        await (0, schemaBootstrap_1.ensurePromptSuggestionsSchema)();
        await (0, schemaBootstrap_1.ensureModelApiProfilesSchema)();
        await (0, schemaBootstrap_1.ensureProviderAuthProfilesSchema)();
        console.log("ai-agent-service schema bootstrap ok");
    }
    catch (e) {
        console.error("ai-agent-service schema bootstrap failed:", e);
    }
    console.log(`ai-agent-service running on port ${PORT}`);
});
