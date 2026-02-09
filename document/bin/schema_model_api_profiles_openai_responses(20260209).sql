BEGIN;

-- Separate OpenAI chat.completions and responses profiles
DO $$
DECLARE
  v_tenant_id UUID;
  v_provider_id UUID;
  v_auth_profile_id UUID;
BEGIN
  -- Find OpenAI provider profile basis (any existing chat profile)
  SELECT tenant_id, provider_id, auth_profile_id
  INTO v_tenant_id, v_provider_id, v_auth_profile_id
  FROM model_api_profiles
  WHERE purpose = 'chat'
    AND provider_id IN (
      SELECT id FROM ai_providers WHERE provider_family = 'openai' OR slug ILIKE 'openai%'
    )
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_provider_id IS NULL THEN
    RAISE NOTICE 'OpenAI provider profile not found. Skipping profile split.';
    RETURN;
  END IF;

  -- 1) Ensure chat.completions profile exists (fallback)
  IF NOT EXISTS (
    SELECT 1
    FROM model_api_profiles
    WHERE tenant_id = v_tenant_id
      AND provider_id = v_provider_id
      AND purpose = 'chat'
      AND profile_key = 'openai.chat.completions.v1'
  ) THEN
    INSERT INTO model_api_profiles (
      tenant_id, provider_id, model_id, profile_key, purpose,
      auth_profile_id, transport, response_mapping, workflow, is_active
    ) VALUES (
      v_tenant_id, v_provider_id, NULL, 'openai.chat.completions.v1', 'chat',
      v_auth_profile_id,
      '{
        "kind": "http_json",
        "method": "POST",
        "path": "/chat/completions",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer {{apiKey}}"
        },
        "body": {
          "model": "{{model}}",
          "messages": [
            { "role": "user", "content": "{{input}}" }
          ],
          "max_completion_tokens": "{{maxTokens}}",
          "temperature": "{{params_temperature}}",
          "top_p": "{{params_top_p}}"
        },
        "timeout_ms": 60000,
        "retry": { "max": 0, "backoff_ms": 0 }
      }'::jsonb,
      '{
        "result_type": "text",
        "extract": { "text_path": "choices[0].message.content" }
      }'::jsonb,
      '{}'::jsonb,
      TRUE
    );
  END IF;

  -- 2) Ensure responses profile exists/updated
  IF EXISTS (
    SELECT 1
    FROM model_api_profiles
    WHERE tenant_id = v_tenant_id
      AND provider_id = v_provider_id
      AND purpose = 'chat'
      AND profile_key = 'openai.responses.v1'
  ) THEN
    UPDATE model_api_profiles
    SET transport = '{
        "kind": "http_json",
        "method": "POST",
        "path": "/responses",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer {{apiKey}}"
        },
        "body": {
          "model": "{{model}}",
          "input": "{{input}}",
          "max_output_tokens": "{{maxTokens}}",
          "temperature": "{{params_temperature}}",
          "top_p": "{{params_top_p}}",
          "text": {
            "format": {
              "type": "json_schema",
              "name": "{{response_schema_name}}",
              "schema": "{{response_schema_json}}",
              "strict": "{{response_schema_strict}}"
            }
          }
        },
        "timeout_ms": 60000,
        "retry": { "max": 0, "backoff_ms": 0 }
      }'::jsonb,
        response_mapping = '{
          "result_type": "text",
          "extract": { "text_path": "output[0].content[0].text" }
        }'::jsonb,
        updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = v_tenant_id
      AND provider_id = v_provider_id
      AND purpose = 'chat'
      AND profile_key = 'openai.responses.v1';
  ELSE
    INSERT INTO model_api_profiles (
      tenant_id, provider_id, model_id, profile_key, purpose,
      auth_profile_id, transport, response_mapping, workflow, is_active
    ) VALUES (
      v_tenant_id, v_provider_id, NULL, 'openai.responses.v1', 'chat',
      v_auth_profile_id,
      '{
        "kind": "http_json",
        "method": "POST",
        "path": "/responses",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer {{apiKey}}"
        },
        "body": {
          "model": "{{model}}",
          "input": "{{input}}",
          "max_output_tokens": "{{maxTokens}}",
          "temperature": "{{params_temperature}}",
          "top_p": "{{params_top_p}}",
          "text": {
            "format": {
              "type": "json_schema",
              "name": "{{response_schema_name}}",
              "schema": "{{response_schema_json}}",
              "strict": "{{response_schema_strict}}"
            }
          }
        },
        "timeout_ms": 60000,
        "retry": { "max": 0, "backoff_ms": 0 }
      }'::jsonb,
      '{
        "result_type": "text",
        "extract": { "text_path": "output[0].content[0].text" }
      }'::jsonb,
      '{}'::jsonb,
      TRUE
    );
  END IF;
END $$;

COMMIT;
