-- ============================================
-- Pricing Service Schema (per-service DB)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. RATE CARDS
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

-- 2. PRICING SKUS
CREATE TABLE pricing_skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_code VARCHAR(200) NOT NULL UNIQUE,
    provider_id UUID,
    provider_slug VARCHAR(100) NOT NULL,
    model_id UUID,
    model_key VARCHAR(255) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
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

-- 3. PRICING RATES
CREATE TABLE pricing_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rate_card_id UUID NOT NULL REFERENCES pricing_rate_cards(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES pricing_skus(id) ON DELETE CASCADE,
    rate_value DECIMAL(12, 6) NOT NULL,
    tier_unit VARCHAR(30) CHECK (tier_unit IN ('context_tokens', 'input_tokens', 'output_tokens', 'image_tokens', 'seconds', 'requests')),
    tier_min BIGINT,
    tier_max BIGINT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rate_card_id, sku_id, tier_unit, tier_min, tier_max),
    CHECK (tier_min IS NULL OR tier_min >= 0),
    CHECK (tier_max IS NULL OR tier_max >= COALESCE(tier_min, 0))
);

CREATE INDEX idx_pricing_rates_rate_card ON pricing_rates(rate_card_id);
CREATE INDEX idx_pricing_rates_sku ON pricing_rates(sku_id);

-- 4. MARKUP RULES
CREATE TABLE pricing_markup_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    provider_slug VARCHAR(100),
    model_id UUID,
    model_key VARCHAR(255),
    modality VARCHAR(30) CHECK (modality IN ('text', 'code', 'image', 'video', 'audio', 'web_search')),
    margin_percent DECIMAL(6, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_markup_rules_status ON pricing_markup_rules(status);
CREATE INDEX idx_pricing_markup_rules_provider ON pricing_markup_rules(provider_slug);
CREATE INDEX idx_pricing_markup_rules_model_key ON pricing_markup_rules(model_key);

-- 5. VIEW: MODEL COST SUMMARIES
CREATE OR REPLACE VIEW pricing_model_cost_summaries AS
SELECT
    s.provider_slug,
    s.model_key,
    s.model_name,
    s.modality,
    r.tier_unit,
    r.tier_min,
    r.tier_max,
    MAX(CASE WHEN s.usage_kind = 'input_tokens' THEN r.rate_value ELSE NULL END) AS input_cost_per_1k,
    MAX(CASE WHEN s.usage_kind = 'output_tokens' THEN r.rate_value ELSE NULL END) AS output_cost_per_1k,
    (
        MAX(CASE WHEN s.usage_kind = 'input_tokens' THEN r.rate_value ELSE NULL END)
        + MAX(CASE WHEN s.usage_kind = 'output_tokens' THEN r.rate_value ELSE NULL END)
    ) / 2 AS avg_cost_per_1k,
    COALESCE(m.margin_percent, 0) AS margin_percent,
    (
        (
            MAX(CASE WHEN s.usage_kind = 'input_tokens' THEN r.rate_value ELSE NULL END)
            + MAX(CASE WHEN s.usage_kind = 'output_tokens' THEN r.rate_value ELSE NULL END)
        ) / 2
    ) * (1 + COALESCE(m.margin_percent, 0) / 100) AS avg_cost_per_1k_with_margin
FROM pricing_rates r
JOIN pricing_skus s ON s.id = r.sku_id
LEFT JOIN pricing_markup_rules m
  ON m.status = 'active'
 AND (m.provider_slug IS NULL OR m.provider_slug = s.provider_slug)
 AND (m.model_key IS NULL OR m.model_key = s.model_key)
 AND (m.modality IS NULL OR m.modality = s.modality)
GROUP BY s.provider_slug, s.model_key, s.model_name, s.modality, r.tier_unit, r.tier_min, r.tier_max, m.margin_percent;

-- updated_at trigger
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END
$do$;

DROP TRIGGER IF EXISTS update_pricing_rate_cards_updated_at ON pricing_rate_cards;
CREATE TRIGGER update_pricing_rate_cards_updated_at
BEFORE UPDATE ON pricing_rate_cards
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_skus_updated_at ON pricing_skus;
CREATE TRIGGER update_pricing_skus_updated_at
BEFORE UPDATE ON pricing_skus
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_rates_updated_at ON pricing_rates;
CREATE TRIGGER update_pricing_rates_updated_at
BEFORE UPDATE ON pricing_rates
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_markup_rules_updated_at ON pricing_markup_rules;
CREATE TRIGGER update_pricing_markup_rules_updated_at
BEFORE UPDATE ON pricing_markup_rules
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
