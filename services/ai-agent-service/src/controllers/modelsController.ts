import { Request, Response } from "express"
import pool, { query } from "../config/db"
import { getProviderAuth, getProviderBase, openaiListModels, anthropicListModels, openaiSimulateChat, anthropicSimulateChat } from "../services/providerClients"

type ModelType = "text" | "image" | "audio" | "video" | "multimodal" | "embedding" | "code"
type ModelStatus = "active" | "inactive" | "deprecated" | "beta"

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
      where.push(`(m.display_name ILIKE $${params.length} OR m.model_id ILIKE $${params.length} OR p.display_name ILIKE $${params.length})`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const result = await query(
      `SELECT
        m.*,
        p.display_name AS provider_display_name,
        p.slug AS provider_slug
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      ${whereSql}
      ORDER BY p.display_name ASC, m.display_name ASC`,
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
        p.display_name AS provider_display_name,
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
      capabilities = [],
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
      metadata = {},
    }: any = req.body

    if (!provider_id || !model_id || !display_name || !model_type) {
      return res.status(400).json({ message: "provider_id, model_id, display_name, model_type are required" })
    }

    const result = await query(
      `INSERT INTO ai_models
        (provider_id, name, model_id, display_name, description, model_type, capabilities, context_window, max_output_tokens,
         input_token_cost_per_1k, output_token_cost_per_1k, currency, is_available, is_default, status, released_at, deprecated_at, metadata)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
       RETURNING *`,
      [
        provider_id,
        name || model_id,
        model_id,
        display_name,
        description,
        model_type,
        JSON.stringify(Array.isArray(capabilities) ? capabilities : []),
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
        capabilities = COALESCE($8::jsonb, capabilities),
        context_window = COALESCE($9, context_window),
        max_output_tokens = COALESCE($10, max_output_tokens),
        input_token_cost_per_1k = COALESCE($11, input_token_cost_per_1k),
        output_token_cost_per_1k = COALESCE($12, output_token_cost_per_1k),
        currency = COALESCE($13, currency),
        is_available = COALESCE($14, is_available),
        is_default = COALESCE($15, is_default),
        status = COALESCE($16, status),
        released_at = COALESCE($17, released_at),
        deprecated_at = COALESCE($18, deprecated_at),
        metadata = COALESCE($19::jsonb, metadata),
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
        body.capabilities ? JSON.stringify(body.capabilities) : null,
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

// 동기화: provider 기준으로 외부 API에서 모델 목록을 가져와 upsert
export async function syncModels(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { provider_id } = req.body as { provider_id?: string }
    if (!provider_id) return res.status(400).json({ message: "provider_id is required" })

    const { apiBaseUrl, slug } = await getProviderBase(provider_id)
    const auth = await getProviderAuth(provider_id)

    let external: Array<{ id: string }> = []
    if (slug === "openai") {
      external = await openaiListModels(auth.endpointUrl || apiBaseUrl, auth.apiKey)
    } else if (slug === "anthropic") {
      external = await anthropicListModels(auth.apiKey)
    } else {
      // google 등은 추후 확장
      return res.status(400).json({ message: `Sync is not implemented for provider: ${slug}` })
    }

    const ids = Array.from(new Set(external.map((m) => m.id).filter(Boolean)))

    await client.query("BEGIN")

    let inserted = 0
    let updated = 0

    for (const modelApiId of ids) {
      // 기본값은 text 모델로 가정 (추후 관리 화면에서 수정 가능)
      const upsert = await client.query(
        `INSERT INTO ai_models
          (provider_id, name, model_id, display_name, model_type, capabilities, is_available, status, metadata)
         VALUES
          ($1,$2,$3,$4,$5,$6::jsonb,TRUE,'active',$7::jsonb)
         ON CONFLICT (provider_id, model_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          is_available = TRUE,
          updated_at = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserted`,
        [
          provider_id,
          modelApiId,
          modelApiId,
          modelApiId,
          "text",
          JSON.stringify(["chat"]),
          JSON.stringify({ synced: true, source: slug }),
        ]
      )
      const ins = !!upsert.rows?.[0]?.inserted
      if (ins) inserted += 1
      else updated += 1
    }

    await client.query("COMMIT")

    res.json({ ok: true, provider_id, provider_slug: slug, total: ids.length, inserted, updated })
  } catch (error: any) {
    await client.query("ROLLBACK")
    console.error("syncModels error:", error)
    res.status(500).json({ message: "Failed to sync models", details: String(error?.message || error) })
  } finally {
    client.release()
  }
}

// 시뮬레이터: 선택한 모델로 테스트 호출(텍스트/챗 기준)
export async function simulateModel(req: Request, res: Response) {
  try {
    const { model_id, input, max_tokens = 128 } = req.body as { model_id?: string; input?: string; max_tokens?: number }
    if (!model_id || !input) return res.status(400).json({ message: "model_id and input are required" })

    const m = await query(
      `SELECT m.id, m.model_id AS model_api_id, m.provider_id, p.slug AS provider_slug, p.api_base_url
       FROM ai_models m
       JOIN ai_providers p ON p.id = m.provider_id
       WHERE m.id = $1`,
      [model_id]
    )
    if (m.rows.length === 0) return res.status(404).json({ message: "Model not found" })
    const row = m.rows[0]

    const providerId = row.provider_id as string
    const providerSlug = row.provider_slug as string
    const modelApiId = row.model_api_id as string
    const apiBaseUrl = (row.api_base_url as string | null) || ""

    const auth = await getProviderAuth(providerId)

    if (providerSlug === "openai") {
      const out = await openaiSimulateChat({
        apiBaseUrl: auth.endpointUrl || apiBaseUrl,
        apiKey: auth.apiKey,
        model: modelApiId,
        input,
        maxTokens: Number(max_tokens) || 128,
      })
      return res.json({ ok: true, provider: providerSlug, model_api_id: modelApiId, output_text: out.output_text, raw: out.raw })
    }

    if (providerSlug === "anthropic") {
      const out = await anthropicSimulateChat({
        apiKey: auth.apiKey,
        model: modelApiId,
        input,
        maxTokens: Number(max_tokens) || 128,
      })
      return res.json({ ok: true, provider: providerSlug, model_api_id: modelApiId, output_text: out.output_text, raw: out.raw })
    }

    return res.status(400).json({ message: `Simulate is not implemented for provider: ${providerSlug}` })
  } catch (error: any) {
    console.error("simulateModel error:", error)
    res.status(500).json({ message: "Failed to simulate model", details: String(error?.message || error) })
  }
}


