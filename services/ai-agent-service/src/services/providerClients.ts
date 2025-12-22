import { query } from "../config/db"
import { ensureSystemTenantId } from "./systemTenantService"
import { decryptApiKey } from "./cryptoService"

type ProviderSlug = "openai" | "anthropic" | "google"

export async function getProviderAuth(providerId: string) {
  // 공용 credential(system tenant) 중 default 우선으로 선택
  const systemTenantId = await ensureSystemTenantId()
  const res = await query(
    `SELECT api_key_encrypted, endpoint_url, organization_id
     FROM provider_api_credentials
     WHERE tenant_id = $1 AND provider_id = $2 AND is_active = TRUE
     ORDER BY is_default DESC, created_at DESC
     LIMIT 1`,
    [systemTenantId, providerId]
  )
  if (res.rows.length === 0) throw new Error("NO_ACTIVE_CREDENTIAL")
  const row = res.rows[0]
  const apiKey = decryptApiKey(row.api_key_encrypted)
  return {
    apiKey,
    endpointUrl: row.endpoint_url as string | null,
    organizationId: row.organization_id as string | null,
  }
}

export async function getProviderBase(providerId: string) {
  const res = await query(`SELECT api_base_url, slug FROM ai_providers WHERE id = $1`, [providerId])
  if (res.rows.length === 0) throw new Error("PROVIDER_NOT_FOUND")
  return {
    apiBaseUrl: (res.rows[0].api_base_url as string | null) || "",
    slug: (res.rows[0].slug as ProviderSlug) || "",
  }
}

export async function openaiListModels(apiBaseUrl: string, apiKey: string) {
  const base = apiBaseUrl || "https://api.openai.com/v1"
  const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OPENAI_LIST_FAILED_${res.status}`)
  const json = await res.json()
  return (json?.data || []) as Array<{ id: string }>
}

export async function anthropicListModels(apiKey: string) {
  // Anthropic는 별도 base url을 쓸 수 있지만, 우선 공식 엔드포인트를 사용
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  })
  if (!res.ok) throw new Error(`ANTHROPIC_LIST_FAILED_${res.status}`)
  const json = await res.json()
  return (json?.data || []) as Array<{ id: string }>
}

export async function openaiSimulateChat(args: { apiBaseUrl: string; apiKey: string; model: string; input: string; maxTokens: number }) {
  const base = args.apiBaseUrl || "https://api.openai.com/v1"
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: [{ role: "user", content: args.input }],
      max_tokens: args.maxTokens,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`OPENAI_SIMULATE_FAILED_${res.status}:${JSON.stringify(json)}`)
  }
  const text = json?.choices?.[0]?.message?.content ?? ""
  return { raw: json, output_text: text }
}

export async function anthropicSimulateChat(args: { apiKey: string; model: string; input: string; maxTokens: number }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens,
      messages: [{ role: "user", content: args.input }],
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`ANTHROPIC_SIMULATE_FAILED_${res.status}:${JSON.stringify(json)}`)
  }
  const text = json?.content?.[0]?.text ?? ""
  return { raw: json, output_text: text }
}


