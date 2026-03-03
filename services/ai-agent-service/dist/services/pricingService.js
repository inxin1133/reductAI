"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupModelPricing = lookupModelPricing;
exports.lookupWebSearchPricing = lookupWebSearchPricing;
exports.calculateCost = calculateCost;
const db_1 = require("../config/db");
const FALLBACK_PRICING = {
    inputCostPerUnit: 0,
    cachedInputCostPerUnit: 0,
    outputCostPerUnit: 0,
    unitSize: 1000000,
    currency: "USD",
};
/**
 * llm_usage_logs.modality → pricing_skus.modality 매핑
 * pricing_skus에는 text, code, image, video, audio, web_search만 존재
 */
function mapModalityForPricing(llmModality) {
    const map = {
        text: "text",
        image_read: "image",
        image_create: "image",
        audio: "audio",
        video: "video",
        music: "audio",
        code: "code",
        multimodal: "text",
        embedding: "text",
    };
    return map[llmModality] ?? "text";
}
/**
 * pricing_skus + pricing_rates 에서 모델의 토큰 단가를 조회한다.
 * pricing_rates.rate_value만 사용 (마진은 크레딧 차감 시 적용).
 *
 * 매칭 우선순위:
 * 1. modelId(ai_models.id)로 매칭 — pricing_skus.model_id FK로 강한 연결
 * 2. providerSlug + modelKey — model_id가 없거나 매칭 실패 시 폴백
 */
async function lookupModelPricing(providerSlug, modelKey, modality, modelId) {
    const pricingModality = mapModalityForPricing(modality);
    try {
        let r = null;
        if (modelId) {
            r = await (0, db_1.query)(`
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
        `, [modelId, pricingModality]);
        }
        if (!r || r.rows.length === 0) {
            r = await (0, db_1.query)(`
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
        `, [providerSlug, modelKey, pricingModality]);
        }
        if (r.rows.length === 0)
            return FALLBACK_PRICING;
        const result = { ...FALLBACK_PRICING };
        for (const row of r.rows) {
            const rateValue = Number(row.rate_value || 0);
            const unitSize = Number(row.unit_size || 1000000);
            result.unitSize = unitSize;
            result.currency = "USD";
            switch (row.usage_kind) {
                case "input_tokens":
                    result.inputCostPerUnit = rateValue;
                    break;
                case "cached_input_tokens":
                    result.cachedInputCostPerUnit = rateValue;
                    break;
                case "output_tokens":
                    result.outputCostPerUnit = rateValue;
                    break;
            }
        }
        return result;
    }
    catch (e) {
        console.warn("[pricingService] lookupModelPricing failed:", e);
        return FALLBACK_PRICING;
    }
}
/**
 * 웹 검색(serper 등) request 단가를 조회한다.
 * pricing_skus: modality=web_search, usage_kind=requests, unit=request
 * providerSlug 예: "serper"
 * @returns USD per request (예: 0.001). 조회 실패 시 0
 */
async function lookupWebSearchPricing(providerSlug) {
    if (!providerSlug || !String(providerSlug).trim())
        return 0;
    const slug = String(providerSlug).trim().toLowerCase();
    try {
        const r = await (0, db_1.query)(`
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
      `, [slug]);
        if (!r.rows.length)
            return 0;
        const row = r.rows[0];
        const rateValue = Number(row?.rate_value ?? 0);
        const unitSize = Math.max(1, Number(row?.unit_size ?? 1));
        return rateValue / unitSize;
    }
    catch (e) {
        console.warn("[pricingService] lookupWebSearchPricing failed:", e);
        return 0;
    }
}
/**
 * 토큰 사용량과 단가로 비용을 계산한다.
 */
function calculateCost(pricing, inputTokens, cachedInputTokens, outputTokens) {
    const inputCost = (inputTokens / pricing.unitSize) * pricing.inputCostPerUnit;
    const cachedInputCost = (cachedInputTokens / pricing.unitSize) * pricing.cachedInputCostPerUnit;
    const outputCost = (outputTokens / pricing.unitSize) * pricing.outputCostPerUnit;
    const totalCost = inputCost + outputCost;
    return { inputCost, cachedInputCost, outputCost, totalCost, currency: pricing.currency };
}
