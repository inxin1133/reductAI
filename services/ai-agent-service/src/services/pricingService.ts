import { query } from "../config/db"

export interface ModelPricing {
  inputCostPerUnit: number
  cachedInputCostPerUnit: number
  outputCostPerUnit: number
  unitSize: number
  currency: string
}

const FALLBACK_PRICING: ModelPricing = {
  inputCostPerUnit: 0,
  cachedInputCostPerUnit: 0,
  outputCostPerUnit: 0,
  unitSize: 1_000_000,
  currency: "USD",
}

/**
 * pricing_skus + pricing_rates 에서 모델의 토큰 단가를 조회한다.
 * 결과는 unit_size(보통 1M tokens) 기준 USD 단가.
 */
export async function lookupModelPricing(
  providerSlug: string,
  modelKey: string,
  modality: string,
): Promise<ModelPricing> {
  try {
    const r = await query(
      `
      WITH active_rc AS (
        SELECT id FROM pricing_rate_cards
        WHERE status = 'active' AND effective_at <= NOW()
        ORDER BY effective_at DESC, version DESC
        LIMIT 1
      )
      SELECT
        s.usage_kind,
        s.unit_size,
        r.rate_value
      FROM pricing_skus s
      JOIN pricing_rates r ON r.sku_id = s.id
      JOIN active_rc arc ON r.rate_card_id = arc.id
      WHERE s.provider_slug = $1
        AND s.model_key = $2
        AND s.modality = $3
        AND s.unit = 'tokens'
        AND (s.token_category IS NULL OR s.token_category = 'text')
        AND s.is_active = TRUE
        AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
      `,
      [providerSlug, modelKey, modality],
    )

    if (r.rows.length === 0) return FALLBACK_PRICING

    const result: ModelPricing = { ...FALLBACK_PRICING }

    for (const row of r.rows) {
      const rateValue = Number(row.rate_value || 0)
      const unitSize = Number(row.unit_size || 1_000_000)
      result.unitSize = unitSize
      result.currency = "USD"

      switch (row.usage_kind) {
        case "input_tokens":
          result.inputCostPerUnit = rateValue
          break
        case "cached_input_tokens":
          result.cachedInputCostPerUnit = rateValue
          break
        case "output_tokens":
          result.outputCostPerUnit = rateValue
          break
      }
    }

    return result
  } catch (e) {
    console.warn("[pricingService] lookupModelPricing failed:", e)
    return FALLBACK_PRICING
  }
}

/**
 * 토큰 사용량과 단가로 비용을 계산한다.
 */
export function calculateCost(
  pricing: ModelPricing,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
) {
  const inputCost = (inputTokens / pricing.unitSize) * pricing.inputCostPerUnit
  const cachedInputCost = (cachedInputTokens / pricing.unitSize) * pricing.cachedInputCostPerUnit
  const outputCost = (outputTokens / pricing.unitSize) * pricing.outputCostPerUnit
  const totalCost = inputCost + outputCost
  return { inputCost, cachedInputCost, outputCost, totalCost, currency: pricing.currency }
}
