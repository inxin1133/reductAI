"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupModelPricing = lookupModelPricing;
exports.lookupImageTokenPricing = lookupImageTokenPricing;
exports.calculateImageTokenCost = calculateImageTokenCost;
exports.lookupImagePricing = lookupImagePricing;
exports.lookupVideoPricing = lookupVideoPricing;
exports.lookupMusicPricing = lookupMusicPricing;
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
        WHERE (
          ($1::uuid IS NOT NULL AND s.model_id = $1)
          OR (
            (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
            AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
          )
        )
          AND s.modality = $4
          AND s.unit = 'tokens'
          AND (s.token_category IS NULL OR s.token_category = 'text')
          AND s.is_active = TRUE
          AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
        `, [modelId ?? null, providerSlug, modelKey, pricingModality]);
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
 * 이미지 모델(GPT Image 1.5, Gemini 3.1 Flash Image 등)의 text/image 토큰별 단가를 조회한다.
 * pricing_skus: modality=image, usage_kind=input_tokens|output_tokens, token_category=text|image
 */
async function lookupImageTokenPricing(providerSlug, modelKey, modelId) {
    const pricingModality = "image";
    let model = modelKey && String(modelKey).trim() ? String(modelKey).trim() : "";
    // OpenAI 이미지 모델 alias: gpt-4o-image*, dall-e-3 등 → gpt-image-1.5 pricing 사용
    // openai, openai-gptimage 등 provider_slug가 openai로 시작할 때 적용
    const slug = providerSlug && String(providerSlug).trim() ? String(providerSlug).trim().toLowerCase() : "";
    if ((slug === "openai" || slug.startsWith("openai-")) && model) {
        const m = model.toLowerCase();
        if (m.startsWith("gpt-4o-image") || m.startsWith("gpt-4o-mini-image") || m === "dall-e-3" || m.startsWith("dall-e-3-")) {
            model = "gpt-image-1.5";
        }
    }
    async function fetchPricing(tokenCategory) {
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
            AND s.modality = 'image'
            AND s.unit = 'tokens'
            AND (s.token_category = $2 OR (s.token_category IS NULL AND $2 = 'text'))
            AND s.is_active = TRUE
            AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
          `, [modelId, tokenCategory]);
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
          WHERE (
            ($1::uuid IS NOT NULL AND s.model_id = $1)
            OR (
              (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
              AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
            )
          )
            AND s.modality = 'image'
            AND s.unit = 'tokens'
            AND (s.token_category = $4 OR (s.token_category IS NULL AND $4 = 'text'))
            AND s.is_active = TRUE
            AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
          `, [modelId ?? null, slug, model, tokenCategory]);
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
            console.warn(`[pricingService] lookupImageTokenPricing(${tokenCategory}) failed:`, e);
            return FALLBACK_PRICING;
        }
    }
    const [text, image] = await Promise.all([fetchPricing("text"), fetchPricing("image")]);
    return { text, image };
}
/**
 * 이미지 모델의 text/image 토큰 breakdown으로 비용을 계산한다.
 * token_breakdown이 없으면 기존 calculateCost와 동일하게 total로 계산 (fallback).
 */
function calculateImageTokenCost(pricing, breakdown) {
    const unitSize = pricing.text.unitSize || 1000000;
    const textInputCost = (breakdown.input_text_tokens / unitSize) * pricing.text.inputCostPerUnit;
    const textOutputCost = (breakdown.output_text_tokens / unitSize) * pricing.text.outputCostPerUnit;
    const imageInputCost = (breakdown.input_image_tokens / unitSize) * pricing.image.inputCostPerUnit;
    const imageOutputCost = (breakdown.output_image_tokens / unitSize) * pricing.image.outputCostPerUnit;
    const inputCost = textInputCost + imageInputCost;
    const cachedInputCost = 0; // 이미지 API는 일반적으로 cached_input 없음
    const outputCost = textOutputCost + imageOutputCost;
    const totalCost = inputCost + outputCost;
    return {
        inputCost,
        cachedInputCost,
        outputCost,
        totalCost,
        currency: pricing.text.currency || "USD",
    };
}
/**
 * 이미지 생성(image_generation) 단가를 조회한다.
 * pricing_skus: modality=image, usage_kind=image_generation, unit=image
 * - OpenAI: metadata.quality, metadata.size (1024x1024, 1024x1536_or_1536x1024 등)
 * - Google/Gemini: metadata.resolution (512, 1024, 2048, 4096 — aspect_ratio는 가격에 영향 없음)
 *
 * 매칭 우선순위 (lookupModelPricing과 동일):
 * 1. modelId(ai_models.id)로 매칭 — pricing_skus.model_id FK로 강한 연결
 * 2. providerSlug + modelKey — model_id가 없거나 매칭 실패 시 폴백
 *
 * @param resolution Gemini 등: 512, 1024, 2048, 4096. Google provider일 때 사용
 * @returns USD per image. 조회 실패 시 0
 */
async function lookupImagePricing(providerSlug, modelKey, size, quality, modelId, resolution) {
    const slug = providerSlug && String(providerSlug).trim() ? String(providerSlug).trim().toLowerCase() : "";
    let model = modelKey && String(modelKey).trim() ? String(modelKey).trim() : "";
    if (!slug)
        return 0;
    // OpenAI 이미지 모델 alias: gpt-4o-image*, dall-e-3 등 → gpt-image-1.5 pricing 사용
    // openai, openai-gptimage 등 provider_slug가 openai로 시작할 때 적용
    if ((slug === "openai" || slug.startsWith("openai-")) && model) {
        const m = model.toLowerCase();
        if (m.startsWith("gpt-4o-image") || m.startsWith("gpt-4o-mini-image") || m === "dall-e-3" || m.startsWith("dall-e-3-")) {
            model = "gpt-image-1.5";
        }
    }
    if (!model)
        return 0;
    const isGoogle = slug === "google";
    const queryResolution = isGoogle && resolution && String(resolution).trim() && String(resolution).toLowerCase() !== "auto"
        ? String(resolution).trim()
        : null;
    // size 정규화: 1536x1024 -> 1024x1536_or_1536x1024 (pricing_skus 메타데이터 형식)
    let normSize = null;
    if (size && String(size).trim()) {
        const s = String(size).trim().replace(/[×*]/g, "x").toLowerCase();
        if (s === "1024x1024")
            normSize = "1024x1024";
        else if (s === "1024x1536" || s === "1536x1024" || s === "1024x1536_or_1536x1024")
            normSize = "1024x1536_or_1536x1024";
        else if (s === "1024x1792" || s === "1792x1024" || s === "1024x1792_or_1792x1024")
            normSize = "1024x1792_or_1792x1024";
        else
            normSize = s;
    }
    // quality 정규화: standard->low, hd->high (DALL-E 3 등)
    let normQuality = null;
    if (quality && String(quality).trim()) {
        const q = String(quality).trim().toLowerCase();
        if (q === "standard")
            normQuality = "low";
        else if (q === "hd")
            normQuality = "high";
        else if (q === "low" || q === "medium" || q === "high")
            normQuality = q;
        else
            normQuality = q;
    }
    // "auto"는 pricing SKU에 없으므로 null로 처리 → fallback 매칭 시도
    const queryQuality = normQuality && normQuality !== "auto" ? normQuality : null;
    const querySize = normSize && normSize !== "auto" ? normSize : null;
    try {
        let r = null;
        if (isGoogle && queryResolution) {
            // Google/Gemini: resolution 기반 매칭 (aspect_ratio는 가격에 영향 없음)
            if (modelId && String(modelId).trim()) {
                r = await (0, db_1.query)(`
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
          WHERE ($2::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $2)
          ORDER BY CASE WHEN $2 IS NOT NULL AND metadata->>'resolution' = $2 THEN 0 ELSE 1 END
          LIMIT 1
          `, [modelId, queryResolution]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
            WHERE (
              ($1::uuid IS NOT NULL AND s.model_id = $1)
              OR (
                (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
                AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
              )
            )
              AND s.modality = 'image'
              AND s.usage_kind = 'image_generation'
              AND s.unit = 'image'
              AND s.is_active = TRUE
          )
          SELECT rate_value, unit_size, metadata
          FROM candidates
          WHERE ($4::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $4)
          ORDER BY CASE WHEN $4 IS NOT NULL AND metadata->>'resolution' = $4 THEN 0 ELSE 1 END
          LIMIT 1
          `, [modelId || null, slug, model, queryResolution]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
            WHERE (
              ($1::uuid IS NOT NULL AND s.model_id = $1)
              OR (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
            )
              AND s.modality = 'image'
              AND s.usage_kind = 'image_generation'
              AND s.unit = 'image'
              AND s.is_active = TRUE
          )
          SELECT rate_value, unit_size, metadata
          FROM candidates
          WHERE ($3::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $3)
          ORDER BY CASE WHEN $3 IS NOT NULL AND metadata->>'resolution' = $3 THEN 0 ELSE 1 END, metadata->>'resolution'
          LIMIT 1
          `, [modelId || null, slug, queryResolution]);
            }
        }
        else {
            // OpenAI 등: size + quality 기반 매칭
            if (modelId && String(modelId).trim()) {
                r = await (0, db_1.query)(`
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
          `, [modelId, queryQuality, querySize]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
            WHERE (
              ($1::uuid IS NOT NULL AND s.model_id = $1)
              OR (
                (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
                AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
              )
            )
              AND s.modality = 'image'
              AND s.usage_kind = 'image_generation'
              AND s.unit = 'image'
              AND s.is_active = TRUE
          )
          SELECT rate_value, unit_size, metadata
          FROM candidates
          WHERE ($4::text IS NULL OR (metadata->>'quality') IS NULL OR metadata->>'quality' = $4)
            AND ($5::text IS NULL OR (metadata->>'size') IS NULL OR metadata->>'size' = $5)
          ORDER BY
            CASE WHEN $4 IS NOT NULL AND metadata->>'quality' = $4 THEN 0 ELSE 1 END,
            CASE WHEN $5 IS NOT NULL AND metadata->>'size' = $5 THEN 0 ELSE 1 END
          LIMIT 1
          `, [modelId ?? null, slug, model, queryQuality, querySize]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
            WHERE (
              ($1::uuid IS NOT NULL AND s.model_id = $1)
              OR (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
            )
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
            CASE WHEN $4 IS NOT NULL AND metadata->>'size' = $4 THEN 0 ELSE 1 END,
            metadata->>'quality',
            metadata->>'size'
          LIMIT 1
          `, [modelId ?? null, slug, queryQuality, querySize]);
            }
        }
        if (!r || !r.rows.length)
            return 0;
        const row = r.rows[0];
        const rateValue = Number(row?.rate_value ?? 0);
        const unitSize = Math.max(1, Number(row?.unit_size ?? 1));
        return rateValue / unitSize;
    }
    catch (e) {
        console.warn("[pricingService] lookupImagePricing failed:", e);
        return 0;
    }
}
/**
 * 비디오 생성(video, seconds) 단가를 조회한다.
 * pricing_skus: modality=video, usage_kind=seconds, unit=second
 * metadata에는 모델별 옵션(resolution 등)이 있으며, 추가 모델 시 확장 가능.
 *
 * 매칭 우선순위 (lookupModelPricing/lookupImagePricing과 동일):
 * 1. modelId(ai_models.id)로 매칭 — pricing_skus.model_id FK로 강한 연결
 * 2. providerSlug + modelKey — model_id가 없거나 매칭 실패 시 폴백
 * 3. provider만 매칭 — model_key 무관
 *
 * @param resolution 요청 해상도. Sora: 720x1280, 1024x1792 등. Veo: 720p, 1080p, 4k. SKU metadata.resolution과 매칭 시 정규화 적용
 * @returns USD per second. 조회 실패 시 0
 */
async function lookupVideoPricing(providerSlug, modelKey, resolution, modelId) {
    const slug = providerSlug && String(providerSlug).trim() ? String(providerSlug).trim().toLowerCase() : "";
    const model = modelKey && String(modelKey).trim() ? String(modelKey).trim() : "";
    if (!slug || !model)
        return 0;
    // resolution 정규화: SKU metadata 형식으로 매핑 (추가 모델 시 metadata 스키마에 맞게 확장)
    let queryResolution = null;
    if (resolution && String(resolution).trim()) {
        const r = String(resolution).trim().replace(/[×*]/g, "x").toLowerCase();
        if (r === "720x1280" || r === "1280x720" || r === "720x1280_or_1280x720")
            queryResolution = "720x1280_or_1280x720";
        else if (r === "1024x1792" || r === "1792x1024" || r === "1024x1792_or_1792x1024")
            queryResolution = "1024x1792_or_1792x1024";
        else
            queryResolution = r;
    }
    try {
        let r = null;
        // 1순위: model_id(ai_models.id)로 강한 연결
        if (modelId && String(modelId).trim()) {
            r = await (0, db_1.query)(`
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
            AND s.modality = 'video'
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($2::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $2)
        ORDER BY CASE WHEN $2 IS NOT NULL AND metadata->>'resolution' = $2 THEN 0 ELSE 1 END
        LIMIT 1
        `, [modelId, queryResolution]);
        }
        // 2순위: model_id 또는 provider_slug + model_key 폴백 (provider_slug 유연: openai-gptimage 등)
        if (!r || r.rows.length === 0) {
            r = await (0, db_1.query)(`
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
          WHERE (
            ($1::uuid IS NOT NULL AND s.model_id = $1)
            OR (
              (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
              AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
            )
          )
            AND s.modality = 'video'
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($4::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $4)
        ORDER BY CASE WHEN $4 IS NOT NULL AND metadata->>'resolution' = $4 THEN 0 ELSE 1 END
        LIMIT 1
        `, [modelId ?? null, slug, model, queryResolution]);
        }
        // 3순위: model_id 또는 provider만 매칭 (model_key 무관)
        if (!r || r.rows.length === 0) {
            r = await (0, db_1.query)(`
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
          WHERE (
            ($1::uuid IS NOT NULL AND s.model_id = $1)
            OR (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
          )
            AND s.modality = 'video'
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
        )
        SELECT rate_value, unit_size, metadata
        FROM candidates
        WHERE ($3::text IS NULL OR (metadata->>'resolution') IS NULL OR metadata->>'resolution' = $3)
        ORDER BY CASE WHEN $3 IS NOT NULL AND metadata->>'resolution' = $3 THEN 0 ELSE 1 END, metadata->>'resolution'
        LIMIT 1
        `, [modelId ?? null, slug, queryResolution]);
        }
        if (!r || !r.rows.length)
            return 0;
        const row = r.rows[0];
        const rateValue = Number(row?.rate_value ?? 0);
        const unitSize = Math.max(1, Number(row?.unit_size ?? 1));
        return rateValue / unitSize;
    }
    catch (e) {
        console.warn("[pricingService] lookupVideoPricing failed:", e);
        return 0;
    }
}
/**
 * 음악 생성(music, seconds) 단가를 조회한다.
 * pricing_skus: modality=music 또는 audio, usage_kind=seconds, unit=second
 * Lyria: $0.06 per 30초 = $0.002/초
 *
 * @returns USD per second. 조회 실패 시 0
 */
async function lookupMusicPricing(providerSlug, modelKey, modelId) {
    const slug = providerSlug && String(providerSlug).trim() ? String(providerSlug).trim().toLowerCase() : "";
    const model = modelKey && String(modelKey).trim() ? String(modelKey).trim() : "";
    if (!slug || !model)
        return 0;
    try {
        let r = null;
        // modality: music 우선, 없으면 audio 폴백
        const modalities = ["music", "audio"];
        for (const modality of modalities) {
            if (modelId && String(modelId).trim()) {
                r = await (0, db_1.query)(`
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
          WHERE s.model_id = $1
            AND s.modality = $2
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
          ORDER BY r.rate_value ASC
          LIMIT 1
          `, [modelId, modality]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
          WHERE (
            ($1::uuid IS NOT NULL AND s.model_id = $1)
            OR (
              (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
              AND (s.model_key = $3 OR $3 LIKE s.model_key || '-%')
            )
          )
            AND s.modality = $4
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
          ORDER BY r.rate_value ASC
          LIMIT 1
          `, [modelId ?? null, slug, model, modality]);
            }
            if (!r || r.rows.length === 0) {
                r = await (0, db_1.query)(`
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
          WHERE (
            ($1::uuid IS NOT NULL AND s.model_id = $1)
            OR (s.provider_slug = $2 OR s.provider_slug LIKE $2 || '-%' OR $2 LIKE s.provider_slug || '-%')
          )
            AND s.modality = $3
            AND s.usage_kind = 'seconds'
            AND s.unit = 'second'
            AND s.is_active = TRUE
          ORDER BY r.rate_value ASC
          LIMIT 1
          `, [modelId ?? null, slug, modality]);
            }
            if (r && r.rows.length > 0) {
                const row = r.rows[0];
                const rateValue = Number(row?.rate_value ?? 0);
                const unitSize = Math.max(1, Number(row?.unit_size ?? 1));
                return rateValue / unitSize;
            }
        }
        return 0;
    }
    catch (e) {
        console.warn("[pricingService] lookupMusicPricing failed:", e);
        return 0;
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
