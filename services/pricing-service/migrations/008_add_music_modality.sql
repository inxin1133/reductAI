-- Add 'music' to pricing_skus.modality and pricing_markup_rules.modality CHECK constraints.
-- Lyria 2 등 음악 생성 모델용 SKU 등록 지원.

-- pricing_skus.modality
ALTER TABLE pricing_skus DROP CONSTRAINT IF EXISTS pricing_skus_modality_check;
ALTER TABLE pricing_skus ADD CONSTRAINT pricing_skus_modality_check
  CHECK (modality IN ('text', 'code', 'image', 'video', 'audio', 'music', 'web_search'));

-- pricing_markup_rules.modality
ALTER TABLE pricing_markup_rules DROP CONSTRAINT IF EXISTS pricing_markup_rules_modality_check;
ALTER TABLE pricing_markup_rules ADD CONSTRAINT pricing_markup_rules_modality_check
  CHECK (modality IN ('text', 'code', 'image', 'video', 'audio', 'music', 'web_search'));

-- Lyria 2 SKU seed ($0.06 per 30 sec)
INSERT INTO pricing_skus (sku_code, provider_slug, model_id, model_key, model_name, modality, usage_kind, token_category, unit, unit_size, currency, is_active, metadata)
SELECT
  'google.lyria-002.music.seconds',
  'google',
  m.id,
  'lyria-002',
  'Lyria 2',
  'music',
  'seconds',
  NULL,
  'second',
  30,
  'USD',
  TRUE,
  '{}'::jsonb
FROM (SELECT 1) _d
LEFT JOIN LATERAL (
  SELECT m.id FROM ai_models m
  JOIN ai_providers p ON p.id = m.provider_id AND p.slug = 'google'
  WHERE m.model_id = 'lyria-002' OR m.model_id LIKE 'lyria-002-%' OR m.name = 'lyria-002' OR m.display_name = 'Lyria 2'
  ORDER BY CASE WHEN m.model_id = 'lyria-002' THEN 0 ELSE 1 END
  LIMIT 1
) m ON TRUE
ON CONFLICT (sku_code) DO UPDATE SET model_id = EXCLUDED.model_id;

-- Lyria 2 rate (active rate card에 연결)
WITH active_rc AS (
  SELECT id FROM pricing_rate_cards
  WHERE status = 'active' AND effective_at <= NOW()
  ORDER BY effective_at DESC, version DESC
  LIMIT 1
),
lyria_sku AS (
  SELECT id FROM pricing_skus WHERE sku_code = 'google.lyria-002.music.seconds'
)
INSERT INTO pricing_rates (rate_card_id, sku_id, rate_value, tier_unit, tier_min, tier_max)
SELECT arc.id, ls.id, 0.06, NULL, NULL, NULL
FROM active_rc arc, lyria_sku ls
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rates pr
  WHERE pr.rate_card_id = arc.id AND pr.sku_id = ls.id
);

-- music margin rule
INSERT INTO pricing_markup_rules (name, scope_type, modality, margin_percent, priority, effective_at)
SELECT 'music_margin', 'modality', 'music', 30, 10, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM pricing_markup_rules WHERE name = 'music_margin' AND modality = 'music');
