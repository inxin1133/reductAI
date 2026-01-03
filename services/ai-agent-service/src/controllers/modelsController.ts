import { Request, Response } from "express"
import pool, { query } from "../config/db"
import { getProviderAuth, openaiSimulateChat, anthropicSimulateChat, googleSimulateChat } from "../services/providerClients"

type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"
type ModelStatus = "active" | "inactive" | "deprecated" | "beta"

function normalizeCapabilities(input: unknown): Record<string, unknown> {
  // 권장 형태: object
  // - 기존 호환: 배열이면 { features: [...] }로 감쌉니다.
  if (Array.isArray(input)) {
    return input.length ? { features: input } : {}
  }
  if (input && typeof input === "object") {
    return input as Record<string, unknown>
  }
  return {}
}

// 목록 조회
export async function getModels(req: Request, res: Response) {
  try {
    const { provider_id, model_type, status, is_available, q } = req.query

    const params: any[] = []
    const where: string[] = []

    if (provider_id) {
      params.push(provider_id)
      where.push(`m.provider_id = $${params.length}`)
    }
    if (model_type) {
      params.push(model_type)
      where.push(`m.model_type = $${params.length}`)
    }
    if (status) {
      params.push(status)
      where.push(`m.status = $${params.length}`)
    }
    if (is_available !== undefined) {
      params.push(is_available === "true")
      where.push(`m.is_available = $${params.length}`)
    }
    if (q) {
      params.push(`%${String(q)}%`)
      where.push(
        `(m.display_name ILIKE $${params.length} OR m.model_id ILIKE $${params.length} OR p.product_name ILIKE $${params.length})`
      )
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const result = await query(
      `SELECT
        m.*,
        p.product_name AS provider_product_name,
        p.slug AS provider_slug
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      ${whereSql}
      ORDER BY m.model_type ASC, m.sort_order ASC, p.product_name ASC, m.display_name ASC`,
      params
    )
    res.json(result.rows)
  } catch (error) {
    console.error("getModels error:", error)
    res.status(500).json({ message: "Failed to fetch models" })
  }
}

export async function getModel(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT
        m.*,
        p.product_name AS provider_product_name,
        p.slug AS provider_slug
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.id = $1`,
      [id]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: "Model not found" })
    res.json(result.rows[0])
  } catch (error) {
    console.error("getModel error:", error)
    res.status(500).json({ message: "Failed to fetch model" })
  }
}

// 생성
export async function createModel(req: Request, res: Response) {
  try {
    const {
      provider_id,
      name,
      model_id,
      display_name,
      description = null,
      model_type,
      prompt_template_id = null,
      response_schema_id = null,
      capabilities = {},
      context_window = null,
      max_output_tokens = null,
      input_token_cost_per_1k = 0,
      output_token_cost_per_1k = 0,
      currency = "USD",
      is_available = true,
      is_default = false,
      status = "active",
      released_at = null,
      deprecated_at = null,
      sort_order = null,
      metadata = {},
    }: any = req.body

    if (!provider_id || !model_id || !display_name || !model_type) {
      return res.status(400).json({ message: "provider_id, model_id, display_name, model_type are required" })
    }

    const result = await query(
      `INSERT INTO ai_models
        (provider_id, name, model_id, display_name, description, model_type, prompt_template_id, response_schema_id, capabilities, context_window, max_output_tokens,
         input_token_cost_per_1k, output_token_cost_per_1k, currency, is_available, is_default, status, released_at, deprecated_at, sort_order, metadata)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)
       RETURNING *`,
      [
        provider_id,
        name || model_id,
        model_id,
        display_name,
        description,
        model_type,
        prompt_template_id,
        response_schema_id,
        JSON.stringify(normalizeCapabilities(capabilities)),
        context_window,
        max_output_tokens,
        input_token_cost_per_1k,
        output_token_cost_per_1k,
        currency,
        is_available,
        is_default,
        status,
        released_at,
        deprecated_at,
        typeof sort_order === "number"
          ? sort_order
          : (
              await query(`SELECT COALESCE(MAX(sort_order), 0) AS max FROM ai_models WHERE model_type = $1`, [model_type])
            ).rows?.[0]?.max + 10,
        JSON.stringify(metadata || {}),
      ]
    )
    res.status(201).json(result.rows[0])
  } catch (error: any) {
    console.error("createModel error:", error)
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Duplicate model_id for provider" })
    }
    res.status(500).json({ message: "Failed to create model" })
  }
}

// 수정
export async function updateModel(req: Request, res: Response) {
  try {
    const { id } = req.params
    const body = req.body || {}

    // 부분 업데이트
    const result = await query(
      `UPDATE ai_models SET
        provider_id = COALESCE($2, provider_id),
        name = COALESCE($3, name),
        model_id = COALESCE($4, model_id),
        display_name = COALESCE($5, display_name),
        description = COALESCE($6, description),
        model_type = COALESCE($7, model_type),
        prompt_template_id = COALESCE($8, prompt_template_id),
        response_schema_id = COALESCE($9, response_schema_id),
        capabilities = COALESCE($10::jsonb, capabilities),
        context_window = COALESCE($11, context_window),
        max_output_tokens = COALESCE($12, max_output_tokens),
        input_token_cost_per_1k = COALESCE($13, input_token_cost_per_1k),
        output_token_cost_per_1k = COALESCE($14, output_token_cost_per_1k),
        currency = COALESCE($15, currency),
        is_available = COALESCE($16, is_available),
        is_default = COALESCE($17, is_default),
        status = COALESCE($18, status),
        released_at = COALESCE($19, released_at),
        deprecated_at = COALESCE($20, deprecated_at),
        sort_order = COALESCE($21, sort_order),
        metadata = COALESCE($22::jsonb, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [
        id,
        body.provider_id ?? null,
        body.name ?? null,
        body.model_id ?? null,
        body.display_name ?? null,
        body.description ?? null,
        body.model_type ?? null,
        body.prompt_template_id ?? null,
        body.response_schema_id ?? null,
        body.capabilities !== undefined ? JSON.stringify(normalizeCapabilities(body.capabilities)) : null,
        body.context_window ?? null,
        body.max_output_tokens ?? null,
        body.input_token_cost_per_1k ?? null,
        body.output_token_cost_per_1k ?? null,
        body.currency ?? null,
        typeof body.is_available === "boolean" ? body.is_available : null,
        typeof body.is_default === "boolean" ? body.is_default : null,
        body.status ?? null,
        body.released_at ?? null,
        body.deprecated_at ?? null,
        typeof body.sort_order === "number" ? body.sort_order : null,
        body.metadata ? JSON.stringify(body.metadata) : null,
      ]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: "Model not found" })
    res.json(result.rows[0])
  } catch (error: any) {
    console.error("updateModel error:", error)
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Duplicate model_id for provider" })
    }
    res.status(500).json({ message: "Failed to update model" })
  }
}

// 순서 변경(드래그 정렬): type 내에서 ordered_ids 순서대로 sort_order 재부여
export async function reorderModels(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { model_type, ordered_ids } = (req.body || {}) as { model_type?: string; ordered_ids?: unknown }
    if (!model_type || !Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return res.status(400).json({ message: "model_type and ordered_ids[] are required" })
    }

    const ids = ordered_ids.map((x) => String(x)).filter(Boolean)
    if (ids.length !== ordered_ids.length) return res.status(400).json({ message: "ordered_ids contains invalid id" })

    // 해당 type의 모델인지 검증
    const check = await query(
      `SELECT COUNT(*)::int AS cnt
       FROM ai_models
       WHERE model_type = $1
         AND id = ANY($2::uuid[])`,
      [model_type, ids]
    )
    if ((check.rows?.[0]?.cnt ?? 0) !== ids.length) {
      return res.status(400).json({ message: "ordered_ids must all belong to the given model_type" })
    }

    await client.query("BEGIN")
    // gap을 둬서 향후 부분 삽입에도 유리하게(10 단위)
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE ai_models SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [i * 10, ids[i]])
    }
    await client.query("COMMIT")
    res.json({ ok: true, model_type, count: ids.length })
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // ignore
    }
    console.error("reorderModels error:", error)
    res.status(500).json({ message: "Failed to reorder models" })
  } finally {
    client.release()
  }
}

// 삭제는 soft delete로 처리 (status+is_available)
// 삭제: hard delete (DB에서 실제 삭제)
export async function deleteModel(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM ai_models WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Model not found" })
    res.json({ ok: true, deleted_id: result.rows[0].id })
  } catch (error: any) {
    // FK 참조 등으로 삭제 불가한 경우(예: model_conversations.model_id)
    if (error?.code === "23503") {
      return res.status(409).json({
        message: "Model is in use and cannot be deleted",
        details: "대화 기록 등 다른 테이블에서 참조 중인 모델은 삭제할 수 없습니다. (먼저 참조를 제거하거나 모델을 비활성화하세요.)",
      })
    }
    console.error("deleteModel error:", error)
    res.status(500).json({ message: "Failed to delete model" })
  }
}

// 시뮬레이터: 선택한 모델로 테스트 호출(텍스트/챗 기준)
export async function simulateModel(req: Request, res: Response) {
  try {
    const { model_id, input, max_tokens = 128 } = req.body as { model_id?: string; input?: string; max_tokens?: number }
    if (!model_id || !input) return res.status(400).json({ message: "model_id and input are required" })

    const m = await query(
      `SELECT m.id, m.model_id AS model_api_id, m.provider_id, p.provider_family, p.name AS provider_name, p.slug AS provider_slug, p.api_base_url
       FROM ai_models m
       JOIN ai_providers p ON p.id = m.provider_id
       WHERE m.id = $1`,
      [model_id]
    )
    if (m.rows.length === 0) return res.status(404).json({ message: "Model not found" })
    const row = m.rows[0]

    const providerId = row.provider_id as string
    // provider 라우팅은 "canonical key(openai/anthropic/google)"로 정규화합니다.
    // - 운영 데이터에서는 ai_providers.name/slug가 다양하게 들어올 수 있어(예: name='OpenAI', slug='openai-chatgpt')
    //   방어적으로 normalize 합니다.
    const providerNameRaw = String(row.provider_name || "")
    const providerSlug = String(row.provider_slug || "")
    const providerFamily = String((row as any).provider_family || "").trim().toLowerCase()
    const providerKey = (() => {
      // 1) provider_family가 있으면 그 값을 최우선 사용
      if (providerFamily) return providerFamily
      // 2) (레거시) name/slug로 추론
      const n = providerNameRaw.trim().toLowerCase()
      const s = providerSlug.trim().toLowerCase()
      const s0 = s.split("-")[0] || s
      if (n.includes("openai")) return "openai"
      if (n.includes("anthropic")) return "anthropic"
      if (n.includes("google")) return "google"
      if (s0) return s0
      return ""
    })()
    const modelApiId = row.model_api_id as string
    const apiBaseUrl = (row.api_base_url as string | null) || ""

    const auth = await getProviderAuth(providerId)

    if (providerKey === "openai") {
      const out = await openaiSimulateChat({
        apiBaseUrl: auth.endpointUrl || apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        input,
        maxTokens: Number(max_tokens) || 128,
      })
      return res.json({ ok: true, provider: providerKey, provider_slug: providerSlug, model_api_id: modelApiId, output_text: out.output_text, raw: out.raw })
    }

    if (providerKey === "anthropic") {
      const out = await anthropicSimulateChat({
        apiKey: auth.apiKey,
        model: modelApiId,
        input,
        maxTokens: Number(max_tokens) || 128,
      })
      return res.json({ ok: true, provider: providerKey, provider_slug: providerSlug, model_api_id: modelApiId, output_text: out.output_text, raw: out.raw })
    }

    if (providerKey === "google") {
      const out = await googleSimulateChat({
        apiBaseUrl: auth.endpointUrl || apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        input,
        maxTokens: Number(max_tokens) || 128,
      })
      return res.json({ ok: true, provider: providerKey, provider_slug: providerSlug, model_api_id: modelApiId, output_text: out.output_text, raw: out.raw })
    }

    return res.status(400).json({ message: `Simulate is not implemented for provider: ${providerKey || providerSlug}` })
  } catch (error: any) {
    // 공용 credential 미등록 등은 409로 명확히 내려 프론트에서 원인을 표시하기 쉽게 합니다.
    if (String(error?.message || error) === "NO_ACTIVE_CREDENTIAL") {
      return res.status(409).json({
        message: "No active credential for provider",
        details: "해당 Provider의 공용 Credential이 등록되어 있어야 시뮬레이터를 실행할 수 있습니다.",
      })
    }
    console.error("simulateModel error:", error)
    res.status(500).json({ message: "Failed to simulate model", details: String(error?.message || error) })
  }
}


