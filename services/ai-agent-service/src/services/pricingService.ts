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
 * llm_usage_logs.modality → pricing_skus.modality 매핑
 * pricing_skus에는 text, code, image, video, audio, web_search만 존재
 */
function mapModalityForPricing(llmModality: string): string {
  const map: Record<string, string> = {
    text: "text",
    image_read: "image",
    image_create: "image",
    audio: "audio",
    video: "video",
    music: "audio",
    code: "code",
    multimodal: "text",
    embedding: "text",
  }
  return map[llmModality] ?? "text"
}

/**
 * pricing_skus + pricing_rates 에서 모델의 토큰 단가를 조회한다.
 * pricing_rates.rate_value만 사용 (마진은 크레딧 차감 시 적용).
 *
 * 매칭 우선순위:
 * 1. modelId(ai_models.id)로 매칭 — pricing_skus.model_id FK로 강한 연결
 * 2. providerSlug + modelKey — model_id가 없거나 매칭 실패 시 폴백
 */
export async function lookupModelPricing(
  providerSlug: string,
  modelKey: string,
  modality: string,
  modelId?: string | null,
): Promise<ModelPricing> {
  const pricingModality = mapModalityForPricing(modality)

  try {
    type Row = { usage_kind: string; unit_size: number; rate_value: number }
    let r: { rows: Row[] } | null = null

    if (modelId) {
      r = await query(
        `
        WITH active_rc AS (
          SELECT id FROM pricing_rate_cards
          WHERE status = 'active' AND effective_at <= NOW()
          ORDER BY effective_at DESC, version DESC
          LIMIT 1
        )
        SELECT s.usage_kind, s.unit_size, r.rate_value
        FROM pricing_skus s
        JOIN pricing_rates r ON r.sku_id = s.id
        JOIN active_rc arc ON r.rate_card_id = arc.id
        WHERE s.model_id = $1
          AND s.modality = $2
          AND s.unit = 'tokens'
          AND (s.token_category IS NULL OR s.token_category = 'text')
          AND s.is_active = TRUE
          AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
        `,
        [modelId, pricingModality],
      )
    }

    if (!r || r.rows.length === 0) {
      r = await query(
        `
        WITH active_rc AS (
          SELECT id FROM pricing_rate_cards
          WHERE status = 'active' AND effective_at <= NOW()
          ORDER BY effective_at DESC, version DESC
          LIMIT 1
        )
        SELECT s.usage_kind, s.unit_size, r.rate_value
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
        [providerSlug, modelKey, pricingModality],
      )
    }

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
 * 이미지 생성(image_generation) 단가를 조회한다.
 * pricing_skus: modality=image, usage_kind=image_generation, unit=image
 * metadata에 quality(low/medium/high), size(1024x1024, 1024x1536_or_1536x1024 등)로 매칭
 *
 * 매칭 우선순위 (lookupModelPricing과 동일):
 * 1. modelId(ai_models.id)로 매칭 — pricing_skus.model_id FK로 강한 연결
 * 2. providerSlug + modelKey — model_id가 없거나 매칭 실패 시 폴백
 *
 * @returns USD per image. 조회 실패 시 0
 */
export async function lookupImagePricing(
  providerSlug: string,
  modelKey: string,
  size?: string | null,
  quality?: string | null,
  modelId?: string | null,
): Promise<number> {
  const slug = providerSlug && String(providerSlug).trim() ? String(providerSlug).trim().toLowerCase() : ""
  let model = modelKey && String(modelKey).trim() ? String(modelKey).trim() : ""
  if (!slug) return 0

  // OpenAI 이미지 모델 alias: gpt-4o-image*, dall-e-3 등 → gpt-image-1.5 pricing 사용
  if (slug === "openai" && model) {
    const m = model.toLowerCase()
    if (m.startsWith("gpt-4o-image") || m.startsWith("gpt-4o-mini-image") || m === "dall-e-3" || m.startsWith("dall-e-3-")) {
      model = "gpt-image-1.5"
    }
  }
  if (!model) return 0

  // size 정규화: 1536x1024 -> 1024x1536_or_1536x1024 (pricing_skus 메타데이터 형식)
  let normSize: string | null = null
  if (size && String(size).trim()) {
    const s = String(size).trim().replace(/[×*]/g, "x").toLowerCase()
    if (s === "1024x1024") normSize = "1024x1024"
    else if (s === "1024x1536" || s === "1536x1024" || s === "1024x1536_or_1536x1024") normSize = "1024x1536_or_1536x1024"
    else if (s === "1024x1792" || s === "1792x1024" || s === "1024x1792_or_1792x1024") normSize = "1024x1792_or_1792x1024"
    else normSize = s
  }

  // quality 정규화: standard->low, hd->high (DALL-E 3 등)
  let normQuality: string | null = null
  if (quality && String(quality).trim()) {
    const q = String(quality).trim().toLowerCase()
    if (q === "standard") normQuality = "low"
    else if (q === "hd") normQuality = "high"
    else if (q === "low" || q === "medium" || q === "high") normQuality = q
    else normQuality = q
  }

  // "auto"는 pricing SKU에 없으므로 null로 처리 → fallback 매칭 시도
  const queryQuality = normQuality && normQuality !== "auto" ? normQuality : null
  const querySize = normSize && normSize !== "auto" ? normSize : null

  try {
    type Row = { rate_value?: number; unit_size?: number }
    let r: { rows: Row[] } | null = null

    // 1순위: model_id(ai_models.id)로 강한 연결
    if (modelId && String(modelId).trim()) {
      r = await query(
        `
        WITH active_rc AS (
          SELECT id FROM pricing_rate_cards
          WHERE status = 'active' AND effective_at <= NOW()
          ORDER BY effective_at DESC, version DESC
          LIMIT 1
        ),
        candidates AS (
          SELECT s.id, s.unit_size, r.rate_value, s.metadata
          FROM pricing_skus s
          JOIN pricing_rates r ON r.sku_id = s.id
          JOIN active_rc arc ON r.rate_card_id = arc.id
          WHERE s.model_id = $1
            AND s.modality = 'image'
            AND s.usage_kind = 'image_generation'
            AND s.unit = 'image'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($2::text IS NULL OR (metadata->>'quality') IS NULL OR metadata->>'quality' = $2)
          AND ($3::text IS NULL OR (metadata->>'size') IS NULL OR metadata->>'size' = $3)
        ORDER BY
          CASE WHEN $2 IS NOT NULL AND metadata->>'quality' = $2 THEN 0 ELSE 1 END,
          CASE WHEN $3 IS NOT NULL AND metadata->>'size' = $3 THEN 0 ELSE 1 END
        LIMIT 1
        `,
        [modelId, queryQuality, querySize],
      )
    }

    // 2순위: provider_slug + model_key 폴백
    if (!r || r.rows.length === 0) {
      r = await query(
        `
        WITH active_rc AS (
          SELECT id FROM pricing_rate_cards
          WHERE status = 'active' AND effective_at <= NOW()
          ORDER BY effective_at DESC, version DESC
          LIMIT 1
        ),
        candidates AS (
          SELECT s.id, s.unit_size, r.rate_value, s.metadata
          FROM pricing_skus s
          JOIN pricing_rates r ON r.sku_id = s.id
          JOIN active_rc arc ON r.rate_card_id = arc.id
          WHERE s.provider_slug = $1
            AND (s.model_key = $2 OR $2 LIKE s.model_key || '-%')
            AND s.modality = 'image'
            AND s.usage_kind = 'image_generation'
            AND s.unit = 'image'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($3::text IS NULL OR (metadata->>'quality') IS NULL OR metadata->>'quality' = $3)
          AND ($4::text IS NULL OR (metadata->>'size') IS NULL OR metadata->>'size' = $4)
        ORDER BY
          CASE WHEN $3 IS NOT NULL AND metadata->>'quality' = $3 THEN 0 ELSE 1 END,
          CASE WHEN $4 IS NOT NULL AND metadata->>'size' = $4 THEN 0 ELSE 1 END
        LIMIT 1
        `,
        [slug, model, queryQuality, querySize],
      )
    }

    // 3순위: provider만 매칭 (model_key 무관, OpenAI 이미지 모델 등)
    if (!r || r.rows.length === 0) {
      r = await query(
        `
        WITH active_rc AS (
          SELECT id FROM pricing_rate_cards
          WHERE status = 'active' AND effective_at <= NOW()
          ORDER BY effective_at DESC, version DESC
          LIMIT 1
        ),
        candidates AS (
          SELECT s.id, s.unit_size, r.rate_value, s.metadata
          FROM pricing_skus s
          JOIN pricing_rates r ON r.sku_id = s.id
          JOIN active_rc arc ON r.rate_card_id = arc.id
          WHERE s.provider_slug = $1
            AND s.modality = 'image'
            AND s.usage_kind = 'image_generation'
            AND s.unit = 'image'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($2::text IS NULL OR (metadata->>'quality') IS NULL OR metadata->>'quality' = $2)
          AND ($3::text IS NULL OR (metadata->>'size') IS NULL OR metadata->>'size' = $3)
        ORDER BY
          CASE WHEN $2 IS NOT NULL AND metadata->>'quality' = $2 THEN 0 ELSE 1 END,
          CASE WHEN $3 IS NOT NULL AND metadata->>'size' = $3 THEN 0 ELSE 1 END,
          metadata->>'quality',
          metadata->>'size'
        LIMIT 1
        `,
        [slug, queryQuality, querySize],
      )
    }

    if (!r || !r.rows.length) return 0
    const row = r.rows[0]
    const rateValue = Number(row?.rate_value ?? 0)
    const unitSize = Math.max(1, Number(row?.unit_size ?? 1))
    return rateValue / unitSize
  } catch (e) {
    console.warn("[pricingService] lookupImagePricing failed:", e)
    return 0
  }
}

/**
 * 웹 검색(serper 등) request 단가를 조회한다.
 * pricing_skus: modality=web_search, usage_kind=requests, unit=request
 * providerSlug 예: "serper"
 * @returns USD per request (예: 0.001). 조회 실패 시 0
 */
export async function lookupWebSearchPricing(providerSlug: string): Promise<number> {
  if (!providerSlug || !String(providerSlug).trim()) return 0
  const slug = String(providerSlug).trim().toLowerCase()
  try {
    const r = await query(
      `
      WITH active_rc AS (
        SELECT id FROM pricing_rate_cards
        WHERE status = 'active' AND effective_at <= NOW()
        ORDER BY effective_at DESC, version DESC
        LIMIT 1
      )
      SELECT r.rate_value, s.unit_size
      FROM pricing_skus s
      JOIN pricing_rates r ON r.sku_id = s.id
      JOIN active_rc arc ON r.rate_card_id = arc.id
      WHERE s.provider_slug = $1
        AND s.modality = 'web_search'
        AND s.usage_kind = 'requests'
        AND s.unit = 'request'
        AND s.is_active = TRUE
      LIMIT 1
      `,
      [slug]
    )
    if (!r.rows.length) return 0
    const row = r.rows[0] as { rate_value?: number; unit_size?: number }
    const rateValue = Number(row?.rate_value ?? 0)
    const unitSize = Math.max(1, Number(row?.unit_size ?? 1))
    return rateValue / unitSize
  } catch (e) {
    console.warn("[pricingService] lookupWebSearchPricing failed:", e)
    return 0
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
