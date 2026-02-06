import { Request, Response } from "express"
import { query } from "../config/db"
import { ensureSystemTenantId } from "../services/systemTenantService"

type Status = "success" | "failure" | "error" | "timeout" | "rate_limited" | "partial" | "failed"

function toInt(v: unknown, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.floor(n))
}

function toStr(v: unknown) {
  const s = typeof v === "string" ? v : ""
  return s.trim()
}

export async function listUsageLogs(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()

    const q = toStr(req.query.q)
    const status = toStr(req.query.status) as Status | ""
    const feature = toStr(req.query.feature_name)
    const providerSlug = toStr(req.query.provider_slug)
    const modality = toStr(req.query.modality)
    const modelApiId = toStr(req.query.model_id)

    const from = toStr(req.query.from)
    const to = toStr(req.query.to)

    const limit = Math.min(toInt(req.query.limit, 50), 200)
    const offset = toInt(req.query.offset, 0)

    const where: string[] = [`l.tenant_id = $1`]
    const params: any[] = [tenantId]

    if (status) {
      where.push(`l.status = $${params.length + 1}`)
      params.push(status)
    }
    if (feature) {
      where.push(`l.feature_name = $${params.length + 1}`)
      params.push(feature)
    }
    if (providerSlug) {
      where.push(`COALESCE(p.slug, l.request_data->>'provider_slug') = $${params.length + 1}`)
      params.push(providerSlug)
    }
    if (modelApiId) {
      where.push(`COALESCE(l.resolved_model, m.model_id) = $${params.length + 1}`)
      params.push(modelApiId)
    }
    if (modality) {
      where.push(`l.modality = $${params.length + 1}`)
      params.push(modality)
    }
    if (from) {
      where.push(`l.created_at >= $${params.length + 1}::timestamptz`)
      params.push(from)
    }
    if (to) {
      where.push(`l.created_at <= $${params.length + 1}::timestamptz`)
      params.push(to)
    }
    if (q) {
      where.push(
        `(
          l.request_id ILIKE $${params.length + 1}
          OR l.error_message ILIKE $${params.length + 1}
          OR m.display_name ILIKE $${params.length + 1}
          OR COALESCE(l.resolved_model, m.model_id) ILIKE $${params.length + 1}
          OR COALESCE(l.requested_model, '') ILIKE $${params.length + 1}
          OR COALESCE(l.resolved_model, '') ILIKE $${params.length + 1}
          OR COALESCE(p.slug, l.request_data->>'provider_slug') ILIKE $${params.length + 1}
        )`
      )
      params.push(`%${q}%`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM llm_usage_logs l
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      ${whereSql}
      `,
      params
    )

    const listRes = await query(
      `
      SELECT
        l.id,
        l.created_at,
        l.status,
        l.feature_name,
        l.modality,
        l.requested_model,
        l.resolved_model,
        l.request_id,
        l.input_tokens,
        l.cached_input_tokens,
        l.output_tokens,
        l.total_tokens,
        l.total_cost,
        l.currency,
        COALESCE(l.response_time_ms, l.latency_ms) AS response_time_ms,
        l.error_code,
        l.error_message,
        l.user_id,
        u.email AS user_email,
        m.id AS ai_model_id,
        m.display_name AS model_display_name,
        COALESCE(l.resolved_model, m.model_id) AS model_api_id,
        COALESCE(p.slug, l.request_data->>'provider_slug') AS provider_slug,
        COALESCE(iu.image_count, 0) AS image_count,
        COALESCE(vu.video_seconds, 0) AS video_seconds,
        COALESCE(mu.music_seconds, 0) AS music_seconds,
        COALESCE(wu.search_count, l.web_search_count, 0) AS web_search_count
      FROM llm_usage_logs l
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      LEFT JOIN (
        SELECT usage_log_id, SUM(image_count)::int AS image_count
        FROM llm_image_usages
        GROUP BY usage_log_id
      ) iu ON iu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS video_seconds
        FROM llm_video_usages
        GROUP BY usage_log_id
      ) vu ON vu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(seconds) AS music_seconds
        FROM llm_music_usages
        GROUP BY usage_log_id
      ) mu ON mu.usage_log_id = l.id
      LEFT JOIN (
        SELECT usage_log_id, SUM(count)::int AS search_count
        FROM llm_web_search_usages
        GROUP BY usage_log_id
      ) wu ON wu.usage_log_id = l.id
      LEFT JOIN users u ON u.id = l.user_id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    )

    return res.json({
      ok: true,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: listRes.rows,
    })
  } catch (e: any) {
    console.error("listUsageLogs error:", e)
    return res.status(500).json({ message: "Failed to list usage logs", details: String(e?.message || e) })
  }
}

export async function getUsageLog(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const id = String(req.params.id || "")
    if (!id) return res.status(400).json({ message: "id is required" })

    const r = await query(
      `
      SELECT
        l.*,
        u.email AS user_email,
        m.display_name AS model_display_name,
        COALESCE(l.resolved_model, m.model_id) AS model_api_id,
        COALESCE(p.slug, l.request_data->>'provider_slug') AS provider_slug
      FROM llm_usage_logs l
      LEFT JOIN ai_models m ON m.id = l.model_id
      LEFT JOIN ai_providers p ON p.id = l.provider_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.tenant_id = $1 AND l.id = $2
      LIMIT 1
      `,
      [tenantId, id]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Not found" })
    const row = r.rows[0]
    const [tokens, images, videos, music, webSearches] = await Promise.all([
      query(`SELECT * FROM llm_token_usages WHERE usage_log_id = $1 ORDER BY created_at ASC`, [id]),
      query(`SELECT * FROM llm_image_usages WHERE usage_log_id = $1 ORDER BY created_at ASC`, [id]),
      query(`SELECT * FROM llm_video_usages WHERE usage_log_id = $1 ORDER BY created_at ASC`, [id]),
      query(`SELECT * FROM llm_music_usages WHERE usage_log_id = $1 ORDER BY created_at ASC`, [id]),
      query(`SELECT * FROM llm_web_search_usages WHERE usage_log_id = $1 ORDER BY created_at ASC`, [id]),
    ])
    return res.json({
      ok: true,
      row,
      usages: {
        tokens: tokens.rows,
        images: images.rows,
        videos: videos.rows,
        music: music.rows,
        web_searches: webSearches.rows,
      },
    })
  } catch (e: any) {
    console.error("getUsageLog error:", e)
    return res.status(500).json({ message: "Failed to get usage log", details: String(e?.message || e) })
  }
}


