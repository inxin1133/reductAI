-- pricing_skus.model_id (ai_models.id) 기준 연결 강화
-- 1. model_id 인덱스 추가 (listSkus model_id 필터 성능)
-- 2. 기존 SKU의 model_id 백필 (ai_models와 매칭)

CREATE INDEX IF NOT EXISTS idx_pricing_skus_model_id ON pricing_skus(model_id);

-- ai_models, ai_providers가 있을 때만 model_id 백필
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_models')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_providers') THEN
    UPDATE pricing_skus s
    SET model_id = sub.ai_model_id
    FROM (
      SELECT s_in.id AS sku_id, lat.id AS ai_model_id
      FROM pricing_skus s_in
      CROSS JOIN LATERAL (
        SELECT am.id
        FROM ai_models am
        JOIN ai_providers ap ON ap.id = am.provider_id AND ap.slug = s_in.provider_slug
        WHERE am.model_id = s_in.model_key
           OR am.model_id LIKE s_in.model_key || '-%'
           OR am.name = s_in.model_key
           OR am.display_name = s_in.model_name
        ORDER BY CASE WHEN am.model_id = s_in.model_key THEN 0 ELSE 1 END
        LIMIT 1
      ) lat
      WHERE s_in.model_id IS NULL
    ) sub
    WHERE s.id = sub.sku_id;
  END IF;
END $$;
