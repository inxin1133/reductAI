-- ============================================
-- Migration: pricing_model_cost_summaries 뷰에 metadata 컬럼 추가
-- SKU의 metadata(quality, size, resolution, task 등)를 목록에 노출
--
-- 실행: psql $DATABASE_URL -f services/pricing-service/migrations/007_add_metadata_to_pricing_model_cost_summaries.sql
-- ============================================

DROP VIEW IF EXISTS pricing_model_cost_summaries;

CREATE VIEW pricing_model_cost_summaries AS
WITH active_rate_card AS (
    SELECT id
    FROM pricing_rate_cards
    WHERE status = 'active' AND effective_at <= NOW()
    ORDER BY effective_at DESC, version DESC
    LIMIT 1
)
SELECT
    provider_slug,
    model_key,
    model_name,
    modality,
    usage_kind,
    token_category,
    'tokens' AS unit_type,
    tier_unit,
    tier_min,
    tier_max,
    input_cost_per_1k,
    output_cost_per_1k,
    avg_cost_per_1k,
    NULL::numeric AS cost_per_unit,
    margin_percent,
    avg_cost_per_1k_with_margin,
    NULL::numeric AS cost_per_unit_with_margin,
    metadata
FROM (
    SELECT
        s_in.provider_slug,
        s_in.model_key,
        s_in.model_name,
        s_in.modality,
        s_in.usage_kind,
        s_in.token_category,
        COALESCE(r_in.tier_unit, r_out.tier_unit) AS tier_unit,
        COALESCE(r_in.tier_min, r_out.tier_min) AS tier_min,
        COALESCE(r_in.tier_max, r_out.tier_max) AS tier_max,
        ROUND(r_in.rate_value * (1000.0 / s_in.unit_size) * 1000.0, 6) AS input_cost_per_1k,
        ROUND(r_out.rate_value * (1000.0 / s_in.unit_size) * 1000.0, 6) AS output_cost_per_1k,
        ROUND(((r_in.rate_value + r_out.rate_value) / 2.0) * (1000.0 / s_in.unit_size) * 1000.0, 6) AS avg_cost_per_1k,
        COALESCE(mr.margin_percent, 0) AS margin_percent,
        ROUND(
            (((r_in.rate_value + r_out.rate_value) / 2.0) * (1000.0 / s_in.unit_size)) * (1 + COALESCE(mr.margin_percent, 0) / 100.0) * 1000.0,
            6
        ) AS avg_cost_per_1k_with_margin,
        COALESCE(s_in.metadata, '{}'::jsonb) AS metadata
    FROM pricing_skus s_in
    JOIN pricing_skus s_out
      ON s_out.provider_slug = s_in.provider_slug
     AND s_out.model_key = s_in.model_key
     AND s_out.modality = s_in.modality
     AND s_out.usage_kind = 'output_tokens'
     AND COALESCE(s_out.token_category, '') = COALESCE(s_in.token_category, '')
     AND s_out.unit_size = s_in.unit_size
    JOIN active_rate_card arc ON TRUE
    JOIN pricing_rates r_in ON r_in.rate_card_id = arc.id AND r_in.sku_id = s_in.id
    JOIN pricing_rates r_out
      ON r_out.rate_card_id = arc.id AND r_out.sku_id = s_out.id
     AND COALESCE(r_out.tier_unit, '') = COALESCE(r_in.tier_unit, '')
     AND COALESCE(r_out.tier_min, -1) = COALESCE(r_in.tier_min, -1)
     AND COALESCE(r_out.tier_max, -1) = COALESCE(r_in.tier_max, -1)
    LEFT JOIN LATERAL (
        SELECT margin_percent
        FROM pricing_markup_rules m
        WHERE m.is_active = TRUE
          AND (m.effective_at IS NULL OR m.effective_at <= NOW())
          AND (m.model_id IS NULL OR m.model_id = s_in.model_id)
          AND (m.modality IS NULL OR m.modality = s_in.modality)
          AND (m.usage_kind IS NULL OR m.usage_kind = s_in.usage_kind)
          AND (m.token_category IS NULL OR m.token_category = s_in.token_category)
        ORDER BY
          (CASE WHEN m.model_id IS NULL THEN 0 ELSE 8 END)
        + (CASE WHEN m.modality IS NULL THEN 0 ELSE 4 END)
        + (CASE WHEN m.usage_kind IS NULL THEN 0 ELSE 2 END)
        + (CASE WHEN m.token_category IS NULL THEN 0 ELSE 1 END) DESC,
          m.priority DESC
        LIMIT 1
    ) mr ON TRUE
    WHERE s_in.usage_kind = 'input_tokens'
      AND s_in.unit = 'tokens'
      AND s_in.is_active = TRUE
) token_rows

UNION ALL

SELECT
    s.provider_slug,
    s.model_key,
    s.model_name,
    s.modality,
    s.usage_kind,
    s.token_category,
    s.unit AS unit_type,
    NULL::varchar AS tier_unit,
    NULL::bigint AS tier_min,
    NULL::bigint AS tier_max,
    NULL::numeric AS input_cost_per_1k,
    NULL::numeric AS output_cost_per_1k,
    NULL::numeric AS avg_cost_per_1k,
    ROUND(r.rate_value * 1000.0, 6) AS cost_per_unit,
    COALESCE(mr.margin_percent, 0) AS margin_percent,
    NULL::numeric AS avg_cost_per_1k_with_margin,
    ROUND(r.rate_value * (1 + COALESCE(mr.margin_percent, 0) / 100.0) * 1000.0, 6) AS cost_per_unit_with_margin,
    COALESCE(s.metadata, '{}'::jsonb) AS metadata
FROM pricing_skus s
JOIN active_rate_card arc ON TRUE
JOIN pricing_rates r ON r.rate_card_id = arc.id AND r.sku_id = s.id
LEFT JOIN LATERAL (
    SELECT margin_percent
    FROM pricing_markup_rules m
    WHERE m.is_active = TRUE
      AND (m.effective_at IS NULL OR m.effective_at <= NOW())
      AND (m.model_id IS NULL OR m.model_id = s.model_id)
      AND (m.modality IS NULL OR m.modality = s.modality)
      AND (m.usage_kind IS NULL OR m.usage_kind = s.usage_kind)
      AND (m.token_category IS NULL OR m.token_category = s.token_category)
    ORDER BY
      (CASE WHEN m.model_id IS NULL THEN 0 ELSE 8 END)
    + (CASE WHEN m.modality IS NULL THEN 0 ELSE 4 END)
    + (CASE WHEN m.usage_kind IS NULL THEN 0 ELSE 2 END)
    + (CASE WHEN m.token_category IS NULL THEN 0 ELSE 1 END) DESC,
      m.priority DESC
    LIMIT 1
) mr ON TRUE
WHERE s.usage_kind IN ('image_generation', 'seconds', 'requests')
  AND s.is_active = TRUE;

COMMENT ON VIEW pricing_model_cost_summaries IS 'User-facing price summary (all modalities) in credits. USD 1 = 1000 credits. Includes SKU metadata (quality, size, resolution, task).';
