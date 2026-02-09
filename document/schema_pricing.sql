-- ============================================
-- LLM 요금 및 요율표
-- PostgreSQL 데이터베이스 스키마
-- ============================================
--
-- 중요:
-- 1. schema.sql 및 schema_models.sql을 먼저 실행하세요.
-- 2. 본 스키마는 요금 테이블 전용이며 llm_usage_logs는 변경하지 않습니다.
--
-- 권장 실행 순서:
--   schema.sql -> schema_models.sql -> schema_pricing.sql -> schema_billing.sql -> schema_credits.sql -> schema_llm_usage.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. RATE CARDS (버전별 요금 스냅샷)
-- ============================================

CREATE TABLE pricing_rate_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, version)
);

CREATE INDEX idx_pricing_rate_cards_status ON pricing_rate_cards(status);
CREATE INDEX idx_pricing_rate_cards_effective_at ON pricing_rate_cards(effective_at);

COMMENT ON TABLE pricing_rate_cards IS '버전별 요금 스냅샷.';
COMMENT ON COLUMN pricing_rate_cards.name IS '요금 스냅샷 이름.';
COMMENT ON COLUMN pricing_rate_cards.version IS '요금 스냅샷 버전.';
COMMENT ON COLUMN pricing_rate_cards.effective_at IS '요금 스냅샷 유효 시간.';
COMMENT ON COLUMN pricing_rate_cards.status IS '요금 스냅샷 상태.';
COMMENT ON COLUMN pricing_rate_cards.description IS '요금 스냅샷 설명.';
COMMENT ON COLUMN pricing_rate_cards.created_at IS '요금 스냅샷 생성 시간.';
COMMENT ON COLUMN pricing_rate_cards.updated_at IS '요금 스냅샷 수정 시간.';

-- ============================================
-- 2. PRICING SKUS (모델/모달리티 사용 단위)
-- ============================================

CREATE TABLE pricing_skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_code VARCHAR(200) NOT NULL UNIQUE,
    provider_id UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
    provider_slug VARCHAR(100) NOT NULL, -- openai/google/serper etc
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    model_key VARCHAR(255) NOT NULL, -- API model id or external key
    model_name VARCHAR(255) NOT NULL, -- display name
    modality VARCHAR(30) NOT NULL CHECK (modality IN ('text', 'code', 'image', 'video', 'audio', 'web_search')),
    usage_kind VARCHAR(50) NOT NULL CHECK (usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens', 'image_generation', 'seconds', 'requests')),
    token_category VARCHAR(20) CHECK (token_category IN ('text', 'image')),
    unit VARCHAR(20) NOT NULL CHECK (unit IN ('tokens', 'image', 'second', 'request')),
    unit_size INTEGER NOT NULL DEFAULT 1 CHECK (unit_size > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_skus_provider ON pricing_skus(provider_slug);
CREATE INDEX idx_pricing_skus_model_key ON pricing_skus(model_key);
CREATE INDEX idx_pricing_skus_modality ON pricing_skus(modality);
CREATE INDEX idx_pricing_skus_usage_kind ON pricing_skus(usage_kind);

COMMENT ON TABLE pricing_skus IS '모델/모달리티 사용 단위(SKU)';
COMMENT ON COLUMN pricing_skus.sku_code IS 'SKU 코드(provider.model.modality.usage_kind.token_category.unit.unit_size)';
COMMENT ON COLUMN pricing_skus.provider_id IS 'Provider ID(ai_providers.id)';
COMMENT ON COLUMN pricing_skus.provider_slug IS 'Provider 슬러그.';
COMMENT ON COLUMN pricing_skus.model_id IS 'Model ID(ai_models.id)';
COMMENT ON COLUMN pricing_skus.model_key IS 'Model 키(api model id or external key)';
COMMENT ON COLUMN pricing_skus.model_name IS 'Model 이름(display name)';
COMMENT ON COLUMN pricing_skus.modality IS '모달리티(text, code, image, video, audio, web_search)';
COMMENT ON COLUMN pricing_skus.usage_kind IS '사용 종류(input_tokens, cached_input_tokens, output_tokens, image_generation, seconds, requests)';
COMMENT ON COLUMN pricing_skus.token_category IS '토큰 카테고리(text, image)';
COMMENT ON COLUMN pricing_skus.unit IS '단위(tokens, image, second, request)';
COMMENT ON COLUMN pricing_skus.unit_size IS '단위 크기(1000, 1024x1024, 1024x1536_or_1536x1024, 1000000)';
COMMENT ON COLUMN pricing_skus.currency IS '통화(USD, KRW, JPY, EUR, GBP, etc)';
COMMENT ON COLUMN pricing_skus.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN pricing_skus.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN pricing_skus.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN pricing_skus.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 3. PRICING RATES (SKU별 계층형 요금)
-- ============================================

CREATE TABLE pricing_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rate_card_id UUID NOT NULL REFERENCES pricing_rate_cards(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES pricing_skus(id) ON DELETE CASCADE,
    rate_value DECIMAL(12, 6) NOT NULL, -- USD per unit_size
    tier_unit VARCHAR(30) CHECK (tier_unit IN ('context_tokens', 'input_tokens', 'output_tokens', 'image_tokens', 'seconds', 'requests')),
    tier_min BIGINT,
    tier_max BIGINT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rate_card_id, sku_id, tier_unit, tier_min, tier_max),
    CHECK (tier_min IS NULL OR tier_min >= 0),
    CHECK (tier_max IS NULL OR tier_max >= COALESCE(tier_min, 0))
);

CREATE INDEX idx_pricing_rates_rate_card ON pricing_rates(rate_card_id);
CREATE INDEX idx_pricing_rates_sku ON pricing_rates(sku_id);

COMMENT ON TABLE pricing_rates IS 'SKU별 계층형 요금.';
COMMENT ON COLUMN pricing_rates.rate_card_id IS '요금 스냅샷 ID(pricing_rate_cards.id)';
COMMENT ON COLUMN pricing_rates.sku_id IS 'SKU ID(pricing_skus.id)';
COMMENT ON COLUMN pricing_rates.rate_value IS '요금 값(USD per unit_size)';
COMMENT ON COLUMN pricing_rates.tier_unit IS '계층 단위(context_tokens, input_tokens, output_tokens, image_tokens, seconds, requests)';
COMMENT ON COLUMN pricing_rates.tier_min IS '계층 최소 값';
COMMENT ON COLUMN pricing_rates.tier_max IS '계층 최대 값';
COMMENT ON COLUMN pricing_rates.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN pricing_rates.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN pricing_rates.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 4. PRICING MARKUP RULES (서비스 마진)
-- ============================================

CREATE TABLE pricing_markup_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('global', 'modality', 'model', 'model_usage')),
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    modality VARCHAR(30) CHECK (modality IN ('text', 'code', 'image', 'video', 'audio', 'web_search')),
    usage_kind VARCHAR(50) CHECK (usage_kind IN ('input_tokens', 'cached_input_tokens', 'output_tokens', 'image_generation', 'seconds', 'requests')),
    token_category VARCHAR(20) CHECK (token_category IN ('text', 'image')),
    margin_percent DECIMAL(6, 2) NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (scope_type = 'global' AND model_id IS NULL AND modality IS NULL AND usage_kind IS NULL AND token_category IS NULL)
        OR (scope_type = 'modality' AND modality IS NOT NULL AND model_id IS NULL)
        OR (scope_type = 'model' AND model_id IS NOT NULL)
        OR (scope_type = 'model_usage' AND model_id IS NOT NULL AND usage_kind IS NOT NULL)
    )
);

CREATE INDEX idx_pricing_markup_rules_model ON pricing_markup_rules(model_id);
CREATE INDEX idx_pricing_markup_rules_modality ON pricing_markup_rules(modality);
CREATE INDEX idx_pricing_markup_rules_active ON pricing_markup_rules(is_active);

COMMENT ON TABLE pricing_markup_rules IS '서비스 마진 규칙(base provider pricing에 적용)';
COMMENT ON COLUMN pricing_markup_rules.name IS '마진 규칙 이름(global, modality, model, model_usage)';
COMMENT ON COLUMN pricing_markup_rules.scope_type IS '규칙 적용 스코프(global, modality, model, model_usage)';
COMMENT ON COLUMN pricing_markup_rules.model_id IS 'Model ID(ai_models.id)';
COMMENT ON COLUMN pricing_markup_rules.modality IS '모달리티(text, code, image, video, audio, web_search)';
COMMENT ON COLUMN pricing_markup_rules.usage_kind IS '사용 종류(input_tokens, cached_input_tokens, output_tokens, image_generation, seconds, requests)';
COMMENT ON COLUMN pricing_markup_rules.token_category IS '토큰 카테고리(text, image)';
COMMENT ON COLUMN pricing_markup_rules.margin_percent IS '마진 퍼센트';
COMMENT ON COLUMN pricing_markup_rules.priority IS '우선순위';
COMMENT ON COLUMN pricing_markup_rules.is_active IS '활성 여부(TRUE, FALSE)';
COMMENT ON COLUMN pricing_markup_rules.effective_at IS '유효 시간(TIMESTAMP)';
COMMENT ON COLUMN pricing_markup_rules.metadata IS '추가 메타데이터(JSON)';
COMMENT ON COLUMN pricing_markup_rules.created_at IS '생성 시간(TIMESTAMP)';
COMMENT ON COLUMN pricing_markup_rules.updated_at IS '수정 시간(TIMESTAMP)';

-- ============================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    END IF;
END $$;

CREATE TRIGGER update_pricing_rate_cards_updated_at BEFORE UPDATE ON pricing_rate_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_skus_updated_at BEFORE UPDATE ON pricing_skus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pricing_markup_rules_updated_at BEFORE UPDATE ON pricing_markup_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. VIEW: USER-FACING TOKEN PRICE SUMMARY
-- ============================================

CREATE OR REPLACE VIEW pricing_model_cost_summaries AS
WITH active_rate_card AS (
    SELECT id
    FROM pricing_rate_cards
    WHERE status = 'active' AND effective_at <= NOW()
    ORDER BY effective_at DESC, version DESC
    LIMIT 1
)
SELECT
    s_in.provider_slug,
    s_in.model_key,
    s_in.model_name,
    s_in.modality,
    COALESCE(r_in.tier_unit, r_out.tier_unit) AS tier_unit,
    COALESCE(r_in.tier_min, r_out.tier_min) AS tier_min,
    COALESCE(r_in.tier_max, r_out.tier_max) AS tier_max,
    ROUND(r_in.rate_value * (1000.0 / s_in.unit_size), 6) AS input_cost_per_1k,
    ROUND(r_out.rate_value * (1000.0 / s_in.unit_size), 6) AS output_cost_per_1k,
    ROUND(((r_in.rate_value + r_out.rate_value) / 2.0) * (1000.0 / s_in.unit_size), 6) AS avg_cost_per_1k,
    COALESCE(mr.margin_percent, 0) AS margin_percent,
    ROUND(
        (((r_in.rate_value + r_out.rate_value) / 2.0) * (1000.0 / s_in.unit_size)) * (1 + COALESCE(mr.margin_percent, 0) / 100.0),
        6
    ) AS avg_cost_per_1k_with_margin
FROM pricing_skus s_in
JOIN pricing_skus s_out
  ON s_out.provider_slug = s_in.provider_slug
 AND s_out.model_key = s_in.model_key
 AND s_out.modality = s_in.modality
 AND s_out.usage_kind = 'output_tokens'
 AND COALESCE(s_out.token_category, '') = COALESCE(s_in.token_category, '')
 AND s_out.unit_size = s_in.unit_size
JOIN active_rate_card arc ON TRUE
JOIN pricing_rates r_in
  ON r_in.rate_card_id = arc.id AND r_in.sku_id = s_in.id
JOIN pricing_rates r_out
  ON r_out.rate_card_id = arc.id AND r_out.sku_id = s_out.id
 AND COALESCE(r_out.tier_unit, '') = COALESCE(r_in.tier_unit, '')
 AND COALESCE(r_out.tier_min, -1) = COALESCE(r_in.tier_min, -1)
 AND COALESCE(r_out.tier_max, -1) = COALESCE(r_in.tier_max, -1)
LEFT JOIN LATERAL (
    SELECT margin_percent
    FROM pricing_markup_rules mr
    WHERE mr.is_active = TRUE
      AND (mr.effective_at IS NULL OR mr.effective_at <= NOW())
      AND (mr.model_id IS NULL OR mr.model_id = s_in.model_id)
      AND (mr.modality IS NULL OR mr.modality = s_in.modality)
      AND (mr.usage_kind IS NULL OR mr.usage_kind = s_in.usage_kind)
      AND (mr.token_category IS NULL OR mr.token_category = s_in.token_category)
    ORDER BY
      (CASE WHEN mr.model_id IS NULL THEN 0 ELSE 8 END)
    + (CASE WHEN mr.modality IS NULL THEN 0 ELSE 4 END)
    + (CASE WHEN mr.usage_kind IS NULL THEN 0 ELSE 2 END)
    + (CASE WHEN mr.token_category IS NULL THEN 0 ELSE 1 END) DESC,
      mr.priority DESC
    LIMIT 1
) mr ON TRUE
WHERE s_in.usage_kind = 'input_tokens'
  AND s_in.unit = 'tokens'
  AND (s_in.token_category IS NULL OR s_in.token_category = 'text');

COMMENT ON VIEW pricing_model_cost_summaries IS 'User-facing token price summary per 1k tokens (avg of input/output + margin).';

-- ============================================
-- 7. SEED DATA: DEFAULT RATE CARD, SKUS, RATES, MARKUPS
-- ============================================

INSERT INTO pricing_rate_cards (name, version, effective_at, status, description)
VALUES ('default', 1, CURRENT_TIMESTAMP, 'active', 'Initial pricing rate card')
ON CONFLICT (name, version) DO NOTHING;

WITH sku_data AS (
    SELECT * FROM (VALUES
        -- Text models
        ('openai', 'gpt-5.2', 'GPT-5.2', 'text', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2.text.input'),
        ('openai', 'gpt-5.2', 'GPT-5.2', 'text', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2.text.cached_input'),
        ('openai', 'gpt-5.2', 'GPT-5.2', 'text', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2.text.output'),
        ('openai', 'gpt-5-mini', 'GPT-5 mini', 'text', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5-mini.text.input'),
        ('openai', 'gpt-5-mini', 'GPT-5 mini', 'text', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5-mini.text.cached_input'),
        ('openai', 'gpt-5-mini', 'GPT-5 mini', 'text', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5-mini.text.output'),
        ('google', 'gemini-3-pro', 'Gemini 3 Pro', 'text', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'google.gemini-3-pro.text.input'),
        ('google', 'gemini-3-pro', 'Gemini 3 Pro', 'text', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'google.gemini-3-pro.text.output'),
        ('google', 'gemini-3-flash', 'Gemini 3 flash', 'text', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'google.gemini-3-flash.text.input'),
        ('google', 'gemini-3-flash', 'Gemini 3 flash', 'text', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'google.gemini-3-flash.text.output'),

        -- Code models
        ('openai', 'gpt-5.2-codex', 'GPT-5.2-Codex', 'code', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2-codex.code.input'),
        ('openai', 'gpt-5.2-codex', 'GPT-5.2-Codex', 'code', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2-codex.code.cached_input'),
        ('openai', 'gpt-5.2-codex', 'GPT-5.2-Codex', 'code', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.2-codex.code.output'),
        ('openai', 'gpt-5.1-codex', 'GPT-5.1-Codex', 'code', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.1-codex.code.input'),
        ('openai', 'gpt-5.1-codex', 'GPT-5.1-Codex', 'code', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.1-codex.code.cached_input'),
        ('openai', 'gpt-5.1-codex', 'GPT-5.1-Codex', 'code', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-5.1-codex.code.output'),

        -- Image model: text tokens
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.text_input'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.text_cached_input'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.text_output'),

        -- Image model: image tokens
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'input_tokens', 'image', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.image_input'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'cached_input_tokens', 'image', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.image_cached_input'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'output_tokens', 'image', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-image-1.5.image.image_output'),

        -- Image generation
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"low","size":"1024x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.low.1024x1024'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"low","size":"1024x1536_or_1536x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.low.1024x1536'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"medium","size":"1024x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.medium.1024x1024'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"medium","size":"1024x1536_or_1536x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.medium.1024x1536'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"high","size":"1024x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.high.1024x1024'),
        ('openai', 'gpt-image-1.5', 'GPT Image 1.5', 'image', 'image_generation', NULL, 'image', 1, '{"quality":"high","size":"1024x1536_or_1536x1024"}'::jsonb, 'openai.gpt-image-1.5.gen.high.1024x1536'),

        -- Video models
        ('openai', 'sora-2', 'Sora 2', 'video', 'seconds', NULL, 'second', 1, '{"resolution":"720x1280_or_1280x720"}'::jsonb, 'openai.sora-2.video.720p'),
        ('openai', 'sora-2-pro', 'Sora 2 Pro', 'video', 'seconds', NULL, 'second', 1, '{"resolution":"720x1280_or_1280x720"}'::jsonb, 'openai.sora-2-pro.video.720p'),
        ('openai', 'sora-2-pro', 'Sora 2 Pro', 'video', 'seconds', NULL, 'second', 1, '{"resolution":"1024x1792_or_1792x1024"}'::jsonb, 'openai.sora-2-pro.video.1024x1792'),

        -- Audio model
        ('openai', 'gpt-o4-mini-tts', 'GPT-o4 mini TTS', 'audio', 'input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-o4-mini-tts.audio.input'),
        ('openai', 'gpt-o4-mini-tts', 'GPT-o4 mini TTS', 'audio', 'cached_input_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-o4-mini-tts.audio.cached_input'),
        ('openai', 'gpt-o4-mini-tts', 'GPT-o4 mini TTS', 'audio', 'output_tokens', 'text', 'tokens', 1000000, '{}'::jsonb, 'openai.gpt-o4-mini-tts.audio.output'),

        -- Web search
        ('serper', 'serper', 'Serper', 'web_search', 'requests', NULL, 'request', 1, '{}'::jsonb, 'serper.web_search.request')
    ) AS t(provider_slug, model_key, model_name, modality, usage_kind, token_category, unit, unit_size, metadata, sku_code)
)
INSERT INTO pricing_skus (
    sku_code, provider_id, provider_slug, model_id, model_key, model_name, modality, usage_kind,
    token_category, unit, unit_size, currency, is_active, metadata
)
SELECT
    s.sku_code,
    p.id AS provider_id,
    s.provider_slug,
    m.id AS model_id,
    s.model_key,
    s.model_name,
    s.modality,
    s.usage_kind,
    s.token_category,
    s.unit,
    s.unit_size,
    'USD',
    TRUE,
    s.metadata
FROM sku_data s
LEFT JOIN ai_providers p
  ON p.provider_family = s.provider_slug OR p.slug = s.provider_slug
LEFT JOIN ai_models m
  ON m.model_id = s.model_key OR m.name = s.model_key OR m.display_name = s.model_name
ON CONFLICT (sku_code) DO NOTHING;

WITH rate_card AS (
    SELECT id FROM pricing_rate_cards
    WHERE name = 'default' AND status = 'active'
    ORDER BY effective_at DESC, version DESC
    LIMIT 1
),
rate_data AS (
    SELECT * FROM (VALUES
        -- GPT-5.2
        ('openai.gpt-5.2.text.input', 1.75, NULL, NULL, NULL),
        ('openai.gpt-5.2.text.cached_input', 0.175, NULL, NULL, NULL),
        ('openai.gpt-5.2.text.output', 14.00, NULL, NULL, NULL),
        -- GPT-5 mini
        ('openai.gpt-5-mini.text.input', 0.25, NULL, NULL, NULL),
        ('openai.gpt-5-mini.text.cached_input', 0.025, NULL, NULL, NULL),
        ('openai.gpt-5-mini.text.output', 2.00, NULL, NULL, NULL),
        -- Gemini 3 Pro (tiered by context tokens)
        ('google.gemini-3-pro.text.input', 2.00, 'context_tokens', 0, 200000),
        ('google.gemini-3-pro.text.output', 12.00, 'context_tokens', 0, 200000),
        ('google.gemini-3-pro.text.input', 4.00, 'context_tokens', 200001, NULL),
        ('google.gemini-3-pro.text.output', 18.00, 'context_tokens', 200001, NULL),
        -- Gemini 3 flash
        ('google.gemini-3-flash.text.input', 0.50, NULL, NULL, NULL),
        ('google.gemini-3-flash.text.output', 3.00, NULL, NULL, NULL),
        -- GPT-5.2-Codex
        ('openai.gpt-5.2-codex.code.input', 1.75, NULL, NULL, NULL),
        ('openai.gpt-5.2-codex.code.cached_input', 0.175, NULL, NULL, NULL),
        ('openai.gpt-5.2-codex.code.output', 14.00, NULL, NULL, NULL),
        -- GPT-5.1-Codex
        ('openai.gpt-5.1-codex.code.input', 1.25, NULL, NULL, NULL),
        ('openai.gpt-5.1-codex.code.cached_input', 0.125, NULL, NULL, NULL),
        ('openai.gpt-5.1-codex.code.output', 10.00, NULL, NULL, NULL),
        -- GPT Image 1.5 (text tokens)
        ('openai.gpt-image-1.5.image.text_input', 5.00, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.image.text_cached_input', 1.25, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.image.text_output', 10.00, NULL, NULL, NULL),
        -- GPT Image 1.5 (image tokens)
        ('openai.gpt-image-1.5.image.image_input', 8.00, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.image.image_cached_input', 2.00, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.image.image_output', 32.00, NULL, NULL, NULL),
        -- GPT Image 1.5 (image generation)
        ('openai.gpt-image-1.5.gen.low.1024x1024', 0.009, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.gen.low.1024x1536', 0.013, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.gen.medium.1024x1024', 0.034, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.gen.medium.1024x1536', 0.050, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.gen.high.1024x1024', 0.133, NULL, NULL, NULL),
        ('openai.gpt-image-1.5.gen.high.1024x1536', 0.200, NULL, NULL, NULL),
        -- Sora 2 / Sora 2 Pro
        ('openai.sora-2.video.720p', 0.10, NULL, NULL, NULL),
        ('openai.sora-2-pro.video.720p', 0.30, NULL, NULL, NULL),
        ('openai.sora-2-pro.video.1024x1792', 0.50, NULL, NULL, NULL),
        -- GPT-o4 mini TTS
        ('openai.gpt-o4-mini-tts.audio.input', 1.10, NULL, NULL, NULL),
        ('openai.gpt-o4-mini-tts.audio.cached_input', 0.28, NULL, NULL, NULL),
        ('openai.gpt-o4-mini-tts.audio.output', 4.40, NULL, NULL, NULL),
        -- Serper
        ('serper.web_search.request', 0.001, NULL, NULL, NULL)
    ) AS t(sku_code, rate_value, tier_unit, tier_min, tier_max)
)
INSERT INTO pricing_rates (rate_card_id, sku_id, rate_value, tier_unit, tier_min, tier_max)
SELECT
    rc.id,
    s.id,
    r.rate_value,
    r.tier_unit,
    r.tier_min,
    r.tier_max
FROM rate_data r
JOIN pricing_skus s ON s.sku_code = r.sku_code
JOIN rate_card rc ON TRUE
ON CONFLICT (rate_card_id, sku_id, tier_unit, tier_min, tier_max) DO NOTHING;

INSERT INTO pricing_markup_rules (name, scope_type, modality, margin_percent, priority, effective_at)
VALUES
    ('default_global', 'global', NULL, 0, 0, CURRENT_TIMESTAMP),
    ('text_margin', 'modality', 'text', 40, 10, CURRENT_TIMESTAMP),
    ('code_margin', 'modality', 'code', 40, 10, CURRENT_TIMESTAMP),
    ('image_margin', 'modality', 'image', 30, 10, CURRENT_TIMESTAMP),
    ('video_margin', 'modality', 'video', 30, 10, CURRENT_TIMESTAMP),
    ('audio_margin', 'modality', 'audio', 30, 10, CURRENT_TIMESTAMP),
    ('web_search_margin', 'modality', 'web_search', 30, 10, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
