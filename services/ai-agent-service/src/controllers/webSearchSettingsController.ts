import { Request, Response } from "express"
import { ensureSystemTenantId } from "../services/systemTenantService"
import { getWebSearchPolicy, upsertWebSearchPolicy, normalizeWebSearchPolicy } from "../services/webSearchSettingsService"

export async function getWebSearchSettings(_req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const policy = await getWebSearchPolicy(tenantId)
    return res.json({ ok: true, row: policy })
  } catch (e: any) {
    console.error("getWebSearchSettings error:", e)
    return res.status(500).json({ message: "Failed to get web search settings", details: String(e?.message || e) })
  }
}

export async function updateWebSearchSettings(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId()
    const body = (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {}) || {}
    const normalized = normalizeWebSearchPolicy({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      default_allowed: typeof body.default_allowed === "boolean" ? body.default_allowed : undefined,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      enabled_providers: Array.isArray(body.enabled_providers) ? (body.enabled_providers as string[]) : undefined,
      max_search_calls: typeof body.max_search_calls === "number" ? body.max_search_calls : undefined,
      max_total_snippet_tokens: typeof body.max_total_snippet_tokens === "number" ? body.max_total_snippet_tokens : undefined,
      timeout_ms: typeof body.timeout_ms === "number" ? body.timeout_ms : undefined,
      retry_max: typeof body.retry_max === "number" ? body.retry_max : undefined,
      retry_base_delay_ms: typeof body.retry_base_delay_ms === "number" ? body.retry_base_delay_ms : undefined,
      retry_max_delay_ms: typeof body.retry_max_delay_ms === "number" ? body.retry_max_delay_ms : undefined,
    })
    const saved = await upsertWebSearchPolicy(tenantId, normalized)
    return res.json({ ok: true, row: saved })
  } catch (e: any) {
    console.error("updateWebSearchSettings error:", e)
    return res.status(500).json({ message: "Failed to update web search settings", details: String(e?.message || e) })
  }
}
