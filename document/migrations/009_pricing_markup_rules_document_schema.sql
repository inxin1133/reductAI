-- pricing_markup_rules를 document/schema_pricing.sql 스키마로 정렬
-- pricing-service migration 001로 생성된 구 schema(status, effective_from, effective_to)가 있으면 변환

-- document schema 컬럼 추가 (model_id는 migration 001에 있으나 FK 없을 수 있음)
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) DEFAULT 'global';
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS usage_kind VARCHAR(50);
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS token_category VARCHAR(20);
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pricing_markup_rules ADD COLUMN IF NOT EXISTS effective_at TIMESTAMP WITH TIME ZONE;

-- 구 schema: status → is_active
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_markup_rules' AND column_name = 'status'
  ) THEN
    UPDATE pricing_markup_rules SET is_active = (status = 'active');
    ALTER TABLE pricing_markup_rules DROP COLUMN IF EXISTS status;
  END IF;
END $$;

-- 구 schema: effective_from → effective_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_markup_rules' AND column_name = 'effective_from'
  ) THEN
    UPDATE pricing_markup_rules SET effective_at = effective_from WHERE effective_at IS NULL AND effective_from IS NOT NULL;
    ALTER TABLE pricing_markup_rules DROP COLUMN IF EXISTS effective_from;
    ALTER TABLE pricing_markup_rules DROP COLUMN IF EXISTS effective_to;
  END IF;
END $$;

-- modality가 있으면 scope_type을 modality로
UPDATE pricing_markup_rules SET scope_type = 'modality' WHERE scope_type = 'global' AND modality IS NOT NULL;
