import { Request, Response } from "express"
import { query } from "../config/db"
import { decryptApiKey } from "../services/cryptoService"

type CredentialRow = {
  id: string
  provider_id: string
  credential_name: string
  api_key_encrypted: string
  endpoint_url?: string | null
  organization_id?: string | null
  is_active?: boolean
  metadata?: any
}

function inferBaseUrl(endpointUrl: string | null | undefined) {
  const raw = String(endpointUrl || "").trim()
  if (!raw) return "https://api.openai.com/v1"
  // If user stored full base like https://api.openai.com/v1 keep it; otherwise accept https://api.openai.com
  if (raw.endsWith("/v1")) return raw
  return `${raw.replace(/\/+$/, "")}/v1`
}

function maskLast4(last4?: string | null) {
  if (!last4) return null
  return `••••••••••${last4}`
}

export async function testSora2Access(req: Request, res: Response) {
  try {
    const { id } = req.params
    const modelId = String((req.query.model_id as string) || "sora-2").trim() || "sora-2"
    if (!id) return res.status(400).json({ message: "credential id is required" })

    const r = await query(
      `SELECT id, provider_id, credential_name, api_key_encrypted, endpoint_url, organization_id, is_active, metadata
       FROM provider_api_credentials
       WHERE id = $1
       LIMIT 1`,
      [id]
    )
    if (!r.rows.length) return res.status(404).json({ message: "Credential not found" })
    const cred = r.rows[0] as CredentialRow
    if (cred.is_active === false) return res.status(400).json({ message: "Credential is not active" })

    const apiKey = decryptApiKey(String(cred.api_key_encrypted || ""))
    const baseUrl = inferBaseUrl(cred.endpoint_url)
    const url = `${baseUrl}/models`

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(cred.organization_id ? { "OpenAI-Organization": String(cred.organization_id) } : {}),
      },
    }).catch((e) => {
      throw new Error(`Failed to call provider endpoint: ${String(e?.message || e)}`)
    })

    const text = await resp.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // ignore
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        ok: false,
        message: "Provider API request failed",
        status: resp.status,
        body: json || text,
      })
    }

    const ids: string[] = Array.isArray(json?.data) ? json.data.map((x: any) => String(x?.id || "")).filter(Boolean) : []
    const matches = ids.filter((x) => x === modelId || x.toLowerCase().includes(modelId.toLowerCase()))
    const hasExact = ids.includes(modelId)
    const hasAnySora = ids.some((x) => x.toLowerCase().includes("sora"))

    const last4 = typeof cred?.metadata?.last4 === "string" ? cred.metadata.last4 : null
    return res.json({
      ok: true,
      credential_id: cred.id,
      credential_name: cred.credential_name,
      api_key_masked: maskLast4(last4),
      endpoint_url: baseUrl,
      requested_model_id: modelId,
      has_exact_model_id: hasExact,
      has_any_sora: hasAnySora,
      matched_model_ids: matches.slice(0, 50),
    })
  } catch (e: any) {
    console.error("testSora2Access error:", e)
    return res.status(500).json({ ok: false, message: "Failed to test Sora access", error: String(e?.message || e) })
  }
}

