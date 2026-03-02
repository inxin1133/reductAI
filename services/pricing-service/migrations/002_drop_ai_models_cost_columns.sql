-- ============================================
-- Migration: ai_models 테이블에서 cost/currency 컬럼 제거
-- 비용 정보는 pricing_skus + pricing_rates(schema_pricing.sql)를 Single Source of Truth로 사용
-- ============================================

BEGIN;

-- 1. ai_models에서 비용 관련 컬럼 제거
ALTER TABLE ai_models
    DROP COLUMN IF EXISTS input_token_cost_per_1k,
    DROP COLUMN IF EXISTS output_token_cost_per_1k,
    DROP COLUMN IF EXISTS currency;

-- 2. calculate_model_usage_cost 함수를 pricing 시스템 기반으로 재작성
DROP FUNCTION IF EXISTS calculate_model_usage_cost(INTEGER, INTEGER, DECIMAL, DECIMAL);

CREATE OR REPLACE FUNCTION calculate_model_usage_cost(
    p_provider_slug VARCHAR,
    p_model_key VARCHAR,
    p_modality VARCHAR,
    p_input_tokens INTEGER,
    p_cached_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0
)
RETURNS TABLE (
    input_cost DECIMAL,
    cached_input_cost DECIMAL,
    output_cost DECIMAL,
    total_cost DECIMAL,
    currency VARCHAR
) AS $$
DECLARE
    v_rate_card_id UUID;
BEGIN
    SELECT id INTO v_rate_card_id
    FROM pricing_rate_cards
    WHERE status = 'active' AND effective_at <= NOW()
    ORDER BY effective_at DESC, version DESC
    LIMIT 1;

    IF v_rate_card_id IS NULL THEN
        RETURN QUERY SELECT 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL, 'USD'::VARCHAR;
        RETURN;
    END IF;

    RETURN QUERY
    WITH costs AS (
        SELECT
            s.usage_kind,
            s.unit_size,
            r.rate_value
        FROM pricing_skus s
        JOIN pricing_rates r ON r.sku_id = s.id AND r.rate_card_id = v_rate_card_id
        WHERE s.provider_slug = p_provider_slug
          AND s.model_key = p_model_key
          AND s.modality = p_modality
          AND s.unit = 'tokens'
          AND (s.token_category IS NULL OR s.token_category = 'text')
          AND s.is_active = TRUE
          AND s.usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens')
    )
    SELECT
        COALESCE((SELECT (p_input_tokens::DECIMAL / c_in.unit_size) * c_in.rate_value FROM costs c_in WHERE c_in.usage_kind = 'input_tokens'), 0) AS input_cost,
        COALESCE((SELECT (p_cached_input_tokens::DECIMAL / c_ci.unit_size) * c_ci.rate_value FROM costs c_ci WHERE c_ci.usage_kind = 'cached_input_tokens'), 0) AS cached_input_cost,
        COALESCE((SELECT (p_output_tokens::DECIMAL / c_out.unit_size) * c_out.rate_value FROM costs c_out WHERE c_out.usage_kind = 'output_tokens'), 0) AS output_cost,
        COALESCE((SELECT (p_input_tokens::DECIMAL / c_in2.unit_size) * c_in2.rate_value FROM costs c_in2 WHERE c_in2.usage_kind = 'input_tokens'), 0)
        + COALESCE((SELECT (p_output_tokens::DECIMAL / c_out2.unit_size) * c_out2.rate_value FROM costs c_out2 WHERE c_out2.usage_kind = 'output_tokens'), 0)
            AS total_cost,
        'USD'::VARCHAR AS currency;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_model_usage_cost IS 'pricing 시스템(pricing_skus + pricing_rates)을 기반으로 모델 사용 비용을 계산하는 함수. 마진은 포함하지 않음.';

COMMIT;
