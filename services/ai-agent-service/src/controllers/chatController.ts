import { Request, Response } from "express"
import { query } from "../config/db"
import { getProviderAuth, getProviderBase, openaiSimulateChat, anthropicSimulateChat } from "../services/providerClients"

type ChatProviderSlug = "openai" | "anthropic"

// Admin에서 관리하는 Provider/Credential을 기반으로 Chat 요청을 실행합니다.
// - 프론트에서는 provider_slug + model(=API 모델 ID)만 넘기면 됩니다.
export async function chatCompletion(req: Request, res: Response) {
  try {
    const {
      provider_slug = "openai",
      model,
      input,
      max_tokens = 512,
    }: {
      provider_slug?: ChatProviderSlug
      model?: string
      input?: string
      max_tokens?: number
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

    if (provider_slug === "openai") {
      const out = await openaiSimulateChat({
        apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
        apiKey: auth.apiKey,
        model,
        input,
        maxTokens: Number(max_tokens) || 512,
      })
      return res.json({
        ok: true,
        provider_slug,
        model,
        output_text: out.output_text,
      })
    }

    if (provider_slug === "anthropic") {
      const out = await anthropicSimulateChat({
        apiKey: auth.apiKey,
        model,
        input,
        maxTokens: Number(max_tokens) || 512,
      })
      return res.json({
        ok: true,
        provider_slug,
        model,
        output_text: out.output_text,
      })
    }

    return res.status(400).json({ message: `Unsupported provider: ${provider_slug}` })
  } catch (e: any) {
    console.error("chatCompletion error:", e)
    // 공용 credential 미등록 등의 케이스를 프론트에서 이해하기 쉽도록 message로 전달
    return res.status(500).json({
      message: "Failed to run chat completion",
      details: String(e?.message || e),
    })
  }
}


