-- ============================================
-- plan_model_access: 서비스 플랜별 LLM 모델 사용 제한
-- ============================================
-- 플랜 티어(free, pro, premium 등)별로 사용 가능한 모델을 정의합니다.
-- - plan_tier에 행이 없으면: 해당 플랜은 모든 모델 사용 가능 (pro 이상)
-- - plan_tier에 행이 있으면: 해당 행의 model_id만 사용 가능

CREATE TABLE IF NOT EXISTS plan_model_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_tier VARCHAR(50) NOT NULL,
  model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_tier, model_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_model_access_plan_tier ON plan_model_access(plan_tier);
CREATE INDEX IF NOT EXISTS idx_plan_model_access_model_id ON plan_model_access(model_id);

COMMENT ON TABLE plan_model_access IS '서비스 플랜별 LLM 모델 사용 권한. plan_tier에 행이 없으면 해당 플랜은 모든 모델 사용 가능.';
COMMENT ON COLUMN plan_model_access.plan_tier IS '플랜 티어: free, pro, premium, business, enterprise';
COMMENT ON COLUMN plan_model_access.model_id IS '허용된 모델 ID (ai_models 참조)';

-- Free 플랜 시드: GPT-5 mini, Gemini 3 flash (모델이 존재할 경우에만 삽입)
-- INSERT INTO plan_model_access (plan_tier, model_id)
-- SELECT 'free', m.id FROM ai_models m
-- JOIN ai_providers p ON p.id = m.provider_id
-- WHERE m.status = 'active' AND m.is_available = TRUE
--   AND ((p.provider_family = 'openai' AND m.model_id ILIKE '%gpt-5-mini%')
--     OR (p.provider_family = 'google' AND m.model_id ILIKE '%gemini-3-flash%'));
