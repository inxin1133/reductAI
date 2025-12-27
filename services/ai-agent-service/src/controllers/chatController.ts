import { Request, Response } from "express"
import { query } from "../config/db"
import { getProviderAuth, getProviderBase, openaiSimulateChat, anthropicSimulateChat } from "../services/providerClients"
import { ensureSystemTenantId } from "../services/systemTenantService"
import jwt from "jsonwebtoken"
import crypto from "crypto"

type ChatProviderSlug = "openai" | "anthropic"
type OutputFormat = "block_json"

function blockJsonInstruction(userPrompt: string) {
  // 서버 레벨에서도 "형식"을 강제합니다. (클라이언트가 실수해도 일관된 출력 보장)
  // ⚠️ 코드 펜스( ``` )를 문자열에 포함하지 않습니다.
  const schema = [
    "{",
    '  "title": "string",',
    '  "summary": "string",',
    '  "blocks": [',
    '    { "type": "markdown", "markdown": "## 제목\\n- 항목" },',
    '    { "type": "code", "language": "java", "code": "System.out.println(\\"hi\\");" },',
    '    { "type": "table", "headers": ["컬럼1","컬럼2"], "rows": [["A","B"],["C","D"]] }',
    "  ]",
    "}",
  ].join("\n")

  const rules = [
    "너는 이제부터 아래 스키마의 JSON 객체만 출력해야 한다.",
    "JSON 외의 어떤 텍스트도 출력하지 마라.",
    "출력은 반드시 '{' 로 시작하고 '}' 로 끝나는 단일 JSON이어야 한다.",
    "출력에 백틱(`) 또는 코드펜스(예: ``` 또는 ```json)를 절대로 포함하지 마라.",
    "규칙:",
    "- JSON만 출력",
    "- code 블록의 code 필드에는 코드만 그대로 넣고, 코드 펜스 같은 마크다운 문법은 절대 넣지 마라",
    "- table 블록은 headers/rows만 사용한다",
    "- markdown은 markdown 블록에서만 사용한다",
  ].join("\n")

  return [rules, "", "스키마:", schema, "", "사용자 요청:", userPrompt].join("\n")
}

function extractOptionalUserIdFromAuthHeader(req: Request): string | null {
  try {
    const header = req.headers.authorization || ""
    const m = header.match(/^Bearer\s+(.+)$/i)
    const token = m?.[1]
    if (!token) return null

    const secret = process.env.JWT_SECRET || "secret"
    const decoded = jwt.verify(token, secret) as { userId?: string }
    const userId = decoded?.userId
    return userId ? String(userId) : null
  } catch {
    return null
  }
}

function safeJsonParse(s: unknown) {
  try {
    if (typeof s === "string") return JSON.parse(s) as unknown
    return s
  } catch {
    return s
  }
}

function extractUsageFromProviderRaw(raw: any): {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
} {
  // OpenAI responses API
  const u = raw?.usage
  if (u && (typeof u.input_tokens === "number" || typeof u.output_tokens === "number")) {
    const input = Number(u.input_tokens || 0)
    const output = Number(u.output_tokens || 0)
    const cached = Number(u?.input_tokens_details?.cached_tokens || 0)
    const total = typeof u.total_tokens === "number" ? Number(u.total_tokens) : input + output
    return { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: total }
  }
  // OpenAI chat.completions
  const cu = raw?.usage
  if (cu && (typeof cu.prompt_tokens === "number" || typeof cu.completion_tokens === "number")) {
    const input = Number(cu.prompt_tokens || 0)
    const output = Number(cu.completion_tokens || 0)
    const cached = Number(cu?.prompt_tokens_details?.cached_tokens || 0)
    const total = typeof cu.total_tokens === "number" ? Number(cu.total_tokens) : input + output
    return { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: total }
  }
  return { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 }
}

async function resolveAiModelId(providerId: string, modelApiId: string) {
  const r = await query(
    `SELECT id, input_token_cost_per_1k, output_token_cost_per_1k, currency
     FROM ai_models
     WHERE provider_id = $1 AND model_id = $2
     LIMIT 1`,
    [providerId, modelApiId]
  )
  if (r.rows.length === 0) return null
  return {
    id: r.rows[0].id as string,
    input_cost_per_1k: Number(r.rows[0].input_token_cost_per_1k || 0),
    output_cost_per_1k: Number(r.rows[0].output_token_cost_per_1k || 0),
    currency: (r.rows[0].currency as string | null) || "USD",
  }
}

// Admin에서 관리하는 Provider/Credential을 기반으로 Chat 요청을 실행합니다.
// - 프론트에서는 provider_slug + model(=API 모델 ID)만 넘기면 됩니다.
export async function chatCompletion(req: Request, res: Response) {
  try {
    const {
      provider_slug = "openai",
      model,
      input,
      max_tokens = 512,
      output_format,
    }: {
      provider_slug?: ChatProviderSlug
      model?: string
      input?: string
      max_tokens?: number
      output_format?: OutputFormat
    } = req.body

    if (!model || !input) {
      return res.status(400).json({ message: "model and input are required" })
    }

    const provider = await query(`SELECT id, slug, api_base_url FROM ai_providers WHERE slug = $1`, [provider_slug])
    if (provider.rows.length === 0) {
      return res.status(404).json({ message: `Provider not found: ${provider_slug}` })
    }

    const providerId = provider.rows[0].id as string
    const auth = await getProviderAuth(providerId)
    const base = await getProviderBase(providerId)
    const started = Date.now()
    const tenantId = await ensureSystemTenantId()
    const userId = extractOptionalUserIdFromAuthHeader(req)
    const modelRow = await resolveAiModelId(providerId, model)
    const requestId = crypto.randomUUID()

    if (provider_slug === "openai") {
      // 모델에 연결된 프롬프트 템플릿(body JSONB)을 가져와 OpenAI 요청 바디에 merge 합니다.
      // - prompt_templates는 현재 system tenant에서 관리되므로 tenant_id 검증은 생략합니다.
      // - templateBody는 responses API 바디 형식으로 저장되어 있으며, base body가 우선(override)됩니다.
      let templateBody: Record<string, unknown> | null = null
      let responseSchema: { name: string; schema: Record<string, unknown>; strict?: boolean } | null = null
      try {
        if (modelRow?.id) {
          const t = await query(
            `
            SELECT pt.body
            FROM ai_models m
            JOIN prompt_templates pt ON pt.id = m.prompt_template_id
            WHERE m.id = $1
              AND pt.is_active = TRUE
            LIMIT 1
            `,
            [modelRow.id]
          )
          const b = t.rows?.[0]?.body
          if (b && typeof b === "object" && !Array.isArray(b)) templateBody = b as Record<string, unknown>
        }
      } catch (e) {
        // best-effort: 템플릿이 없거나 오류면 기존 동작 유지
        console.warn("[prompt-template] load failed:", e)
      }

      // 모델에 연결된 출력 계약(JSON schema)을 가져와 response_format 강제에 사용합니다.
      try {
        if (modelRow?.id) {
          const r = await query(
            `
            SELECT rs.name, rs.strict, rs.schema
            FROM ai_models m
            JOIN response_schemas rs ON rs.id = m.response_schema_id
            WHERE m.id = $1
              AND rs.is_active = TRUE
            LIMIT 1
            `,
            [modelRow.id]
          )
          const row = r.rows?.[0]
          const schema = row?.schema
          if (row?.name && schema && typeof schema === "object" && !Array.isArray(schema)) {
            responseSchema = { name: String(row.name), strict: Boolean(row.strict), schema: schema as Record<string, unknown> }
          }
        }
      } catch (e) {
        console.warn("[response-schema] load failed:", e)
      }

      const shouldBlockJson = output_format === "block_json" || !!responseSchema
      const effectiveInput = shouldBlockJson ? blockJsonInstruction(input) : input
      const out = await openaiSimulateChat({
        apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
        apiKey: auth.apiKey,
        model,
        input: effectiveInput,
        maxTokens: Number(max_tokens) || 512,
        outputFormat: shouldBlockJson ? "block_json" : undefined,
        templateBody,
        responseSchema,
      })

      // ✅ usage log (best-effort)
      try {
        if (modelRow) {
          const usage = extractUsageFromProviderRaw(out.raw)
          const inputCost = (usage.input_tokens / 1000) * modelRow.input_cost_per_1k
          const outputCost = (usage.output_tokens / 1000) * modelRow.output_cost_per_1k
          const totalCost = inputCost + outputCost
          const responseTimeMs = Date.now() - started
          await query(
            `
            INSERT INTO model_usage_logs (
              tenant_id, user_id, model_id, credential_id, feature_name, request_id,
              input_tokens, output_tokens, total_tokens,
              input_cost, output_cost, total_cost, currency,
              response_time_ms, status, request_data, response_data, model_parameters,
              ip_address, user_agent, metadata
            ) VALUES (
              $1, $2, $3, $4, 'chat', $5,
              $6, $7, $8,
              $9, $10, $11, $12,
              $13, 'success', $14::jsonb, $15::jsonb, $16::jsonb,
              $17::inet, $18, $19::jsonb
            )
            ON CONFLICT (request_id) DO NOTHING
            `,
            [
              tenantId,
              userId,
              modelRow.id,
              auth.credentialId || null,
              requestId,
              usage.input_tokens,
              usage.output_tokens,
              usage.total_tokens,
              inputCost,
              outputCost,
              totalCost,
              modelRow.currency,
              responseTimeMs,
              JSON.stringify({
                provider_slug,
                model,
                max_tokens,
                output_format: output_format || null,
                // 민감/대용량 방지용: 프롬프트는 프리뷰만 저장
                input_preview: String(input || "").slice(0, 500),
              }),
              JSON.stringify({
                raw: safeJsonParse(out.raw),
                output_text_preview: String(out.output_text || "").slice(0, 1000),
              }),
              JSON.stringify({
                max_tokens,
                output_format: output_format || null,
              }),
              (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || (req.socket.remoteAddress ?? null),
              String(req.headers["user-agent"] || ""),
              JSON.stringify({
                api: "ai-agent-service",
                endpoint: "/api/ai/chat",
              }),
            ]
          )
        }
      } catch (e) {
        console.warn("[usage-log] insert failed:", e)
      }

      return res.json({
        ok: true,
        provider_slug,
        model,
        output_text: out.output_text,
        raw: out.raw,
      })
    }

    if (provider_slug === "anthropic") {
      const out = await anthropicSimulateChat({
        apiKey: auth.apiKey,
        model,
        input,
        maxTokens: Number(max_tokens) || 512,
      })

      // ✅ usage log (best-effort)
      try {
        if (modelRow) {
          const usage = extractUsageFromProviderRaw(out.raw)
          const inputCost = (usage.input_tokens / 1000) * modelRow.input_cost_per_1k
          const cachedInputCost = (usage.cached_input_tokens / 1000) * modelRow.input_cost_per_1k
          const outputCost = (usage.output_tokens / 1000) * modelRow.output_cost_per_1k
          const totalCost = inputCost + outputCost
          const responseTimeMs = Date.now() - started
          await query(
            `
            INSERT INTO model_usage_logs (
              tenant_id, user_id, model_id, credential_id, feature_name, request_id,
              input_tokens, cached_input_tokens, output_tokens, total_tokens,
              input_cost, cached_input_cost, output_cost, total_cost, currency,
              response_time_ms, status, request_data, response_data, model_parameters,
              ip_address, user_agent, metadata
            ) VALUES (
              $1, $2, $3, $4, 'chat', $5,
              $6, $7, $8, $9,
              $10, $11, $12, $13, $14,
              $15, 'success', $16::jsonb, $17::jsonb, $18::jsonb,
              $19::inet, $20, $21::jsonb
            )
            ON CONFLICT (request_id) DO NOTHING
            `,
            [
              tenantId,
              userId,
              modelRow.id,
              auth.credentialId || null,
              requestId,
              usage.input_tokens,
              usage.cached_input_tokens,
              usage.output_tokens,
              usage.total_tokens,
              inputCost,
              cachedInputCost,
              outputCost,
              totalCost,
              modelRow.currency,
              responseTimeMs,
              JSON.stringify({
                provider_slug,
                model,
                max_tokens,
                input_preview: String(input || "").slice(0, 500),
              }),
              JSON.stringify({
                raw: safeJsonParse(out.raw),
                output_text_preview: String(out.output_text || "").slice(0, 1000),
              }),
              JSON.stringify({ max_tokens }),
              (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || (req.socket.remoteAddress ?? null),
              String(req.headers["user-agent"] || ""),
              JSON.stringify({ api: "ai-agent-service", endpoint: "/api/ai/chat" }),
            ]
          )
        }
      } catch (e) {
        console.warn("[usage-log] insert failed:", e)
      }

      return res.json({
        ok: true,
        provider_slug,
        model,
        output_text: out.output_text,
        raw: out.raw,
      })
    }

    return res.status(400).json({ message: `Unsupported provider: ${provider_slug}` })
  } catch (e: any) {
    console.error("chatCompletion error:", e)
    // 실패도 best-effort로 기록(가능한 경우)
    try {
      const { provider_slug = "openai", model, input, max_tokens = 512, output_format } = req.body || {}
      const provider = await query(`SELECT id FROM ai_providers WHERE slug = $1`, [provider_slug])
      if (provider.rows.length > 0 && model) {
        const providerId = provider.rows[0].id as string
        const tenantId = await ensureSystemTenantId()
        const userId = extractOptionalUserIdFromAuthHeader(req)
        const modelRow = await resolveAiModelId(providerId, String(model))
        const requestId = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
        if (modelRow) {
          await query(
            `
            INSERT INTO model_usage_logs (
              tenant_id, user_id, model_id, feature_name, request_id,
              input_tokens, output_tokens, total_tokens,
              total_cost, currency,
              response_time_ms, status, error_code, error_message, request_data, metadata
            ) VALUES (
              $1, $2, $3, 'chat', $4,
              0, 0, 0,
              0, $5,
              NULL, 'error', NULL, $6, $7::jsonb, $8::jsonb
            )
            ON CONFLICT (request_id) DO NOTHING
            `,
            [
              tenantId,
              userId,
              modelRow.id,
              requestId,
              modelRow.currency,
              String(e?.message || e),
              JSON.stringify({
                provider_slug,
                model,
                max_tokens,
                output_format: output_format || null,
                input_preview: String(input || "").slice(0, 500),
              }),
              JSON.stringify({ api: "ai-agent-service", endpoint: "/api/ai/chat" }),
            ]
          )
        }
      }
    } catch (logErr) {
      console.warn("[usage-log] error insert failed:", logErr)
    }
    // 공용 credential 미등록 등의 케이스를 프론트에서 이해하기 쉽도록 message로 전달
    return res.status(500).json({
      message: "Failed to run chat completion",
      details: String(e?.message || e),
    })
  }
}


