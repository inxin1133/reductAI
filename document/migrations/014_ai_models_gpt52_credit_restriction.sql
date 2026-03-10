-- GPT-5.2 모델에 크레딧 선검증 metadata 적용
-- 마지막 구간 [0, 500]: 옵션 기본값만, 이미지 1개 제한

UPDATE ai_models m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || '{"credit_restriction":{"min_credits_from":0,"min_credits_to":500,"block_below_from":true}}'::jsonb
FROM ai_providers p
WHERE m.provider_id = p.id
  AND (p.slug = 'openai' OR p.slug = 'openai-chatgpt')
  AND m.model_id = 'gpt-5.2'
  AND m.status = 'active';
