import { Request, Response } from "express"
import { query } from "../config/db"
import { AuthedRequest } from "../middleware/requireAuth"
import { getProviderAuth, getProviderBase, openaiSimulateChat } from "../services/providerClients"
import { ensureSystemTenantId } from "../services/systemTenantService"

// Timeline(대화 히스토리) API
// - 프론트(Timeline 좌측 목록/메시지 영역)에서 사용합니다.
// - 보안 강화를 위해: JWT에서 userId를 추출해서 user별로 저장/조회합니다.

type Role = "user" | "assistant"

function normalizeTitle(s: string) {
  const trimmed = (s || "").replace(/\s+/g, " ").trim()
  if (!trimmed) return "새 대화"
  // 너무 길면 잘라서 UI 안정성 확보
  const max = 40
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function fallbackTitleFromPrompt(input: string) {
  const firstLine = (input || "").split("\n")[0]?.trim() || "새 대화"
  return normalizeTitle(firstLine)
}

async function generateTitleByOpenAi(firstMessage: string) {
  // OpenAI credential이 등록되어 있으면, 제목을 더 자연스럽게 생성합니다.
  // - 출력 포맷을 JSON으로 강제하여 파싱 안정성을 높입니다.
  // - 너무 비싼 모델을 쓰지 않기 위해 기본은 gpt-4o-mini를 사용합니다.
  try {
    const provider = await query(`SELECT id FROM ai_providers WHERE slug = 'openai' LIMIT 1`)
    if (provider.rows.length === 0) throw new Error("OPENAI_PROVIDER_NOT_FOUND")
    const providerId = provider.rows[0].id as string

    const auth = await getProviderAuth(providerId)
    const base = await getProviderBase(providerId)

    const prompt = [
      "다음 사용자 질문을 보고 '대화 타임라인'에 표시할 제목을 만들어줘.",
      "- 한국어로 자연스럽게",
      "- 12~24자 내외의 짧은 제목",
      "- 핵심 키워드 2~4개를 뽑아서 함께 제시",
      "- 반드시 JSON으로만 출력",
      "",
      "출력 형식:",
      '{"title":"...","keywords":["...","..."]}',
      "",
      `사용자 질문: ${firstMessage}`,
    ].join("\n")

    const out = await openaiSimulateChat({
      apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
      apiKey: auth.apiKey,
      model: "gpt-4o-mini",
      input: prompt,
      maxTokens: 120,
    })

    const raw = out.output_text || ""
    const parsed = JSON.parse(raw) as { title?: string; keywords?: string[] }
    const title = normalizeTitle(parsed?.title || "")
    const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map(k => String(k)).filter(Boolean).slice(0, 4) : []

    // UI 표시: "제목 · 키워드1,키워드2"
    if (keywords.length > 0) return normalizeTitle(`${title} · ${keywords.join(",")}`)
    return title
  } catch (e) {
    console.warn("[Timeline] title generation fallback:", e)
    return fallbackTitleFromPrompt(firstMessage)
  }
}

async function resolveAiModelIdByApiModel(modelApiId?: string | null) {
  // model_conversations는 ai_models(id)를 필요로 하므로,
  // 프론트에서 넘어오는 model(=API model id)을 ai_models.id로 매핑합니다.
  // 우선순위:
  // 1) OpenAI provider + 정확히 일치하는 model_id
  // 2) OpenAI provider + text + default
  // 3) text + default
  const apiModel = (modelApiId || "").trim()

  if (apiModel) {
    const r = await query(
      `SELECT m.id
       FROM ai_models m
       JOIN ai_providers p ON p.id = m.provider_id
       WHERE p.slug = 'openai' AND m.model_id = $1
       LIMIT 1`,
      [apiModel]
    )
    if (r.rows.length > 0) return r.rows[0].id as string
  }

  const r2 = await query(
    `SELECT m.id
     FROM ai_models m
     JOIN ai_providers p ON p.id = m.provider_id
     WHERE p.slug = 'openai' AND m.model_type = 'text' AND m.status = 'active' AND m.is_available = TRUE
     ORDER BY m.is_default DESC, m.created_at DESC
     LIMIT 1`
  )
  if (r2.rows.length > 0) return r2.rows[0].id as string

  const r3 = await query(
    `SELECT id
     FROM ai_models
     WHERE model_type = 'text' AND status = 'active' AND is_available = TRUE
     ORDER BY is_default DESC, created_at DESC
     LIMIT 1`
  )
  if (r3.rows.length > 0) return r3.rows[0].id as string

  throw new Error("NO_AVAILABLE_TEXT_MODEL")
}

// 대화 스레드 목록 (최근 업데이트 순)
export async function listThreads(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()
    const result = await query(
      `SELECT id, user_id, title, created_at, updated_at
       FROM model_conversations
       WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
       ORDER BY updated_at DESC`,
      [tenantId, userId]
    )
    res.json(result.rows)
  } catch (e) {
    console.error("listThreads error:", e)
    res.status(500).json({ message: "Failed to fetch threads" })
  }
}

// 스레드 생성
export async function createThread(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()
    const { title, first_message, model }: { title?: string; first_message?: string; model?: string } = req.body || {}

    // 제목 우선순위:
    // 1) first_message가 있으면 OpenAI로 요약/키워드 제목 생성
    // 2) title이 있으면 그대로 사용
    // 3) 기본값
    const safeTitle = first_message
      ? await generateTitleByOpenAi(String(first_message))
      : normalizeTitle(title || "새 대화")

    const modelId = await resolveAiModelIdByApiModel(model || null)

    const result = await query(
      `INSERT INTO model_conversations (tenant_id, user_id, model_id, title, status)
       VALUES ($1, $2::uuid, $3, $4, 'active')
       RETURNING id, user_id, title, created_at, updated_at`,
      [tenantId, userId, modelId, safeTitle]
    )
    res.status(201).json(result.rows[0])
  } catch (e) {
    console.error("createThread error:", e)
    res.status(500).json({ message: "Failed to create thread" })
  }
}

// 스레드 메시지 목록
export async function listMessages(req: Request, res: Response) {
  try {
    const { id } = req.params
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()

    // 보안: 본인 대화만 조회 가능
    const owns = await query(
      `SELECT 1 FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`,
      [id, tenantId, userId]
    )
    if (owns.rows.length === 0) return res.status(404).json({ message: "Thread not found" })

    const result = await query(
      `SELECT id, conversation_id, role, content, metadata, message_order, created_at
       FROM model_messages
       WHERE conversation_id = $1
       ORDER BY message_order ASC`,
      [id]
    )
    res.json(result.rows)
  } catch (e) {
    console.error("listMessages error:", e)
    res.status(500).json({ message: "Failed to fetch messages" })
  }
}

// 스레드에 메시지 추가 + threads.updated_at 갱신
export async function addMessage(req: Request, res: Response) {
  try {
    const { id } = req.params
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()
    const body = (req.body as unknown as { role?: Role; content?: string; model?: string | null }) || {}
    const role = body.role
    const content = body.content
    const model = body.model ?? null

    if (!role || !content) {
      return res.status(400).json({ message: "role and content are required" })
    }

    // 보안: 본인 대화만 수정 가능
    const owns = await query(
      `SELECT 1 FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`,
      [id, tenantId, userId]
    )
    if (owns.rows.length === 0) return res.status(404).json({ message: "Thread not found" })

    const ord = await query(
      `SELECT COALESCE(MAX(message_order), 0) + 1 AS next_order
       FROM model_messages
       WHERE conversation_id = $1`,
      [id]
    )
    const nextOrder = Number(ord.rows?.[0]?.next_order || 1)

    // model_messages는 별도 model 컬럼이 없으므로 metadata에 저장합니다.
    const metadata = { ...(model ? { model } : {}) }

    const insert = await query(
      `INSERT INTO model_messages (conversation_id, role, content, message_order, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, conversation_id, role, content, metadata, message_order, created_at`,
      [id, role, content, nextOrder, JSON.stringify(metadata)]
    )

    // 최근순 정렬을 위해 updated_at 갱신
    await query(`UPDATE model_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id])

    res.status(201).json(insert.rows[0])
  } catch (e) {
    console.error("addMessage error:", e)
    res.status(500).json({ message: "Failed to add message" })
  }
}

// 스레드 제목 수정(선택)
export async function updateThreadTitle(req: Request, res: Response) {
  try {
    const { id } = req.params
    const userId = (req as AuthedRequest).userId
    const tenantId = await ensureSystemTenantId()
    const { title }: { title?: string } = req.body || {}
    const safeTitle = (title || "").trim()
    if (!safeTitle) return res.status(400).json({ message: "title is required" })

    const result = await query(
      `UPDATE model_conversations
       SET title = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'
       RETURNING id, user_id, title, created_at, updated_at`,
      [id, tenantId, userId, safeTitle]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: "Thread not found" })
    res.json(result.rows[0])
  } catch (e) {
    console.error("updateThreadTitle error:", e)
    res.status(500).json({ message: "Failed to update thread title" })
  }
}


