-- ============================================
-- 첨부 파일 제한: ai_models.capabilities에 max_reference_images 설정
-- - 모델별 이미지 첨부 상한 반영
-- - capabilities가 없거나 limits가 없으면 새로 생성
-- ============================================

-- gpt-image-1.5: 16장 (jsonb_set create_if_missing=true로 기존 limits 유지)
UPDATE ai_models
SET capabilities = jsonb_set(
  COALESCE(capabilities, '{}'::jsonb),
  '{limits,max_reference_images}',
  '16'::jsonb,
  true
)
WHERE model_id = 'gpt-image-1.5';

-- Gemini 3.1 Flash Image: 14장
UPDATE ai_models
SET capabilities = jsonb_set(
  COALESCE(capabilities, '{}'::jsonb),
  '{limits,max_reference_images}',
  '14'::jsonb,
  true
)
WHERE model_id = 'gemini-3.1-flash-image-preview';

-- Gemini 3 Pro Image: 14장
UPDATE ai_models
SET capabilities = jsonb_set(
  COALESCE(capabilities, '{}'::jsonb),
  '{limits,max_reference_images}',
  '14'::jsonb,
  true
)
WHERE model_id = 'gemini-3-pro-image-preview';

-- Gemini 2.5 Flash Image: 3장
UPDATE ai_models
SET capabilities = jsonb_set(
  COALESCE(capabilities, '{}'::jsonb),
  '{limits,max_reference_images}',
  '3'::jsonb,
  true
)
WHERE model_id = 'gemini-2.5-flash-image-preview';
