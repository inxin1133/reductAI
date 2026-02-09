import { Request, Response } from "express"
import { query } from "../config/db"
import { ensureSystemTenantId } from "../services/systemTenantService"
import { getWebSearchPolicy } from "../services/webSearchSettingsService"

type ModelType = "text" | "image" | "audio" | "music" | "video" | "multimodal" | "embedding" | "code"

const MODEL_TYPES: ModelType[] = ["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"]

export async function getChatUiConfig(_req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    // 1) active models only (provider shown if it has at least one active model)
    const rows = await query(
      `
      SELECT
        m.id AS model_db_id,
        m.model_type,
        m.model_id AS model_api_id,
        m.display_name AS model_display_name,
        m.description AS model_description,
        m.status AS model_status,
        m.is_available,
        m.is_default,
        m.sort_order,
        m.capabilities,
        p.id AS provider_id,
        p.name AS provider_name,
        p.product_name AS provider_product_name,
        p.description AS provider_description,
        p.logo_key AS provider_logo_key,
        p.slug AS provider_slug,
        p.provider_family
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.status = 'active'
      ORDER BY m.model_type ASC, p.product_name ASC, m.sort_order ASC, m.display_name ASC
      `
    )

    const providersByType: Record<string, any[]> = {}
    for (const t of MODEL_TYPES) providersByType[t] = []

    // group by (model_type, provider_id)
    const map = new Map<string, any>()
    for (const r of rows.rows) {
      const modelType = String(r.model_type || "")
      if (!MODEL_TYPES.includes(modelType as ModelType)) continue
      const providerId = String(r.provider_id || "")
      if (!providerId) continue
      const key = `${modelType}::${providerId}`
      let entry = map.get(key)
      if (!entry) {
        entry = {
          model_type: modelType,
          provider: {
            id: providerId,
            name: String(r.provider_name || ""),
            product_name: String(r.provider_product_name || ""),
            description: typeof r.provider_description === "string" ? r.provider_description : "",
            logo_key: typeof r.provider_logo_key === "string" ? r.provider_logo_key : null,
            slug: String(r.provider_slug || ""),
            provider_family: String(r.provider_family || ""),
          },
          // active models (dropdown will further filter by is_available)
          models: [] as any[],
        }
        map.set(key, entry)
        providersByType[modelType].push(entry)
      }

      entry.models.push({
        id: String(r.model_db_id),
        model_type: modelType,
        model_api_id: String(r.model_api_id || ""),
        display_name: String(r.model_display_name || ""),
        description: typeof r.model_description === "string" ? r.model_description : "",
        status: String(r.model_status || ""),
        is_available: Boolean(r.is_available),
        is_default: Boolean(r.is_default),
        sort_order: Number(r.sort_order || 0),
        capabilities: r.capabilities && typeof r.capabilities === "object" ? r.capabilities : {},
      })
    }

    // include only types that actually have providers (for tabs)
    const activeModelTypes = MODEL_TYPES.filter((t) => (providersByType[t] || []).length > 0)
    const webSearchPolicy = await getWebSearchPolicy(tenantId)

    return res.json({
      ok: true,
      model_types: activeModelTypes,
      providers_by_type: providersByType,
      web_search_policy: webSearchPolicy,
    })
  } catch (e: any) {
    console.error("getChatUiConfig error:", e)
    return res.status(500).json({ message: "Failed to get chat UI config", details: String(e?.message || e) })
  }
}

export async function getChatPromptSuggestions(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()

    const modelType = typeof req.query.model_type === "string" ? req.query.model_type.trim() : ""
    const mt = modelType && MODEL_TYPES.includes(modelType as ModelType) ? modelType : ""
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 12
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 12

    const params: any[] = [tenantId]
    const where: string[] = [
      `tenant_id = $1`,
      `is_active = TRUE`,
      `(
        (scope_type = 'GLOBAL' AND scope_id IS NULL)
        OR (scope_type = 'TENANT' AND scope_id = $1)
      )`,
    ]
    if (mt) {
      params.push(mt)
      where.push(`model_type = $${params.length}`)
    }

    const rows = await query(
      `
      SELECT id, model_type, model_id, title, text, sort_order, metadata
      FROM prompt_suggestions
      WHERE ${where.join(" AND ")}
      ORDER BY sort_order ASC, updated_at DESC
      LIMIT $${params.length + 1}
      `,
      [...params, limit]
    )

    return res.json({ ok: true, model_type: mt || null, limit, rows: rows.rows })
  } catch (e: any) {
    console.error("getChatPromptSuggestions error:", e)
    return res.status(500).json({ message: "Failed to get prompt suggestions", details: String(e?.message || e) })
  }
}


