-- Add max_input_tokens to ai_models (이전: capabilities.limits.max_input_tokens)
-- context_window, max_input_tokens, max_output_tokens는 DB 컬럼에서 단일 소스로 관리
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS max_input_tokens INTEGER;
COMMENT ON COLUMN ai_models.max_input_tokens IS '최대 입력(프롬프트) 토큰 수. Provider 문서의 context length와 동일 권장.';
