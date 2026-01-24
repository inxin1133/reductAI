import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import providersRoutes from "./routes/providersRoutes"
import credentialsRoutes from "./routes/credentialsRoutes"
import modelsRoutes from "./routes/modelsRoutes"
import tenantTypeModelAccessRoutes from "./routes/tenantTypeModelAccessRoutes"
import {
  ensureAiAccessSchema,
  ensureModelApiProfilesSchema,
  ensureProviderAuthProfilesSchema,
  ensureModelRoutingRulesSchema,
  ensureModelUsageLogsSchema,
  ensurePromptTemplatesSchema,
  ensurePromptSuggestionsSchema,
  ensureResponseSchemasSchema,
  ensureTimelineSchema,
  ensureMessageMediaAssetsSchema,
} from "./services/schemaBootstrap"
import chatRoutes from "./routes/chatRoutes"
import chatUiRoutes from "./routes/chatUiRoutes"
import timelineRoutes from "./routes/timelineRoutes"
import mediaRoutes from "./routes/mediaRoutes"
import usageLogsRoutes from "./routes/usageLogsRoutes"
import routingRulesRoutes from "./routes/routingRulesRoutes"
import promptTemplatesRoutes from "./routes/promptTemplatesRoutes"
import responseSchemasRoutes from "./routes/responseSchemasRoutes"
import promptSuggestionsRoutes from "./routes/promptSuggestionsRoutes"
import modelApiProfilesRoutes from "./routes/modelApiProfilesRoutes"
import providerAuthProfilesRoutes from "./routes/providerAuthProfilesRoutes"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3007

app.use(cors())
app.use(express.json())

// AI Providers / Credentials 관리 API
// - Admin 화면에서 사용하는 설정 API
app.use("/api/ai/providers", providersRoutes)
app.use("/api/ai/credentials", credentialsRoutes)
app.use("/api/ai/models", modelsRoutes)
app.use("/api/ai/model-access-by-type", tenantTypeModelAccessRoutes)
app.use("/api/ai/chat", chatRoutes)
app.use("/api/ai/chat-ui", chatUiRoutes)
app.use("/api/ai/timeline", timelineRoutes)
app.use("/api/ai/media", mediaRoutes)
app.use("/api/ai/usage-logs", usageLogsRoutes)
app.use("/api/ai/routing-rules", routingRulesRoutes)
app.use("/api/ai/prompt-templates", promptTemplatesRoutes)
app.use("/api/ai/response-schemas", responseSchemasRoutes)
app.use("/api/ai/prompt-suggestions", promptSuggestionsRoutes)
app.use("/api/ai/model-api-profiles", modelApiProfilesRoutes)
app.use("/api/ai/provider-auth-profiles", providerAuthProfilesRoutes)

app.get("/health", (_req: any, res: any) => {
  res.json({ status: "ok", service: "ai-agent-service" })
})

app.listen(PORT, async () => {
  // 서비스 부팅 시 필요한 테이블이 없으면 생성
  // (운영에서는 migration 적용 권장)
  try {
    await ensureAiAccessSchema()
    await ensureTimelineSchema()
    await ensureMessageMediaAssetsSchema()
    await ensureModelUsageLogsSchema()
    await ensureModelRoutingRulesSchema()
    await ensurePromptTemplatesSchema()
    await ensureResponseSchemasSchema()
    await ensurePromptSuggestionsSchema()
    await ensureModelApiProfilesSchema()
    await ensureProviderAuthProfilesSchema()
    // Best-effort: seed default Sora video model_api_profile for OpenAI Sora providers.
    // Users can edit/override in Admin (Model API Profiles).
    const { ensureDefaultSoraVideoProfiles } = await import("./services/schemaBootstrap")
    await ensureDefaultSoraVideoProfiles()
    console.log("ai-agent-service schema bootstrap ok")
  } catch (e) {
    console.error("ai-agent-service schema bootstrap failed:", e)
  }
  console.log(`ai-agent-service running on port ${PORT}`)
})


