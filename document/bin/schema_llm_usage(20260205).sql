BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------
-- Ensure llm_usage_logs exists (create if missing)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255),

    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE RESTRICT,
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    requested_model VARCHAR(255) NOT NULL,
    resolved_model VARCHAR(255) NOT NULL,
    modality VARCHAR(20) NOT NULL CHECK (modality IN ('text', 'image_read', 'image_create', 'audio', 'video', 'music')),
    region VARCHAR(64),

    feature_name VARCHAR(100) NOT NULL DEFAULT 'unknown',

    web_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    web_provider VARCHAR(50),
    web_search_mode VARCHAR(20) CHECK (web_search_mode IN ('auto', 'forced', 'off')),
    web_budget_count INTEGER,
    web_search_count INTEGER NOT NULL DEFAULT 0,

    routing_rule_id UUID REFERENCES model_routing_rules(id) ON DELETE SET NULL,
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    fallback_reason VARCHAR(50) CHECK (fallback_reason IN ('rate_limit', 'cost_limit', 'timeout', 'error', 'policy')),
    attempt_index INTEGER,
    parent_usage_log_id UUID REFERENCES llm_usage_logs(id) ON DELETE SET NULL,

    request_id VARCHAR(255),
    conversation_id UUID REFERENCES model_conversations(id) ON DELETE SET NULL,
    model_message_id UUID REFERENCES model_messages(id) ON DELETE SET NULL,
    prompt_hash CHAR(64),
    prompt_length_chars INTEGER,
    prompt_tokens_estimated INTEGER,

    response_length_chars INTEGER,
    response_bytes BIGINT,
    finish_reason VARCHAR(50) CHECK (finish_reason IN ('stop', 'length', 'content_filter', 'error')),
    content_filtered BOOLEAN NOT NULL DEFAULT FALSE,
    tool_call_count INTEGER NOT NULL DEFAULT 0,

    provider_created_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    headers_received_at TIMESTAMP WITH TIME ZONE,
    first_token_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    latency_ms INTEGER,
    ttfb_ms INTEGER,
    ttft_ms INTEGER,
    queue_wait_ms INTEGER,
    network_ms INTEGER,
    server_processing_ms INTEGER,
    response_time_ms INTEGER,

    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'failure', 'error', 'timeout', 'rate_limited')),
    http_status INTEGER,
    error_code VARCHAR(100),
    error_message TEXT,
    error_retryable BOOLEAN,

    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    input_cost DECIMAL(10, 6) DEFAULT 0,
    cached_input_cost DECIMAL(10, 6) DEFAULT 0,
    output_cost DECIMAL(10, 6) DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',

    request_data JSONB,
    response_data JSONB,
    model_parameters JSONB,

    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- Ensure columns exist on llm_usage_logs (for older schema)
-- ------------------------------------------------------------------
ALTER TABLE llm_usage_logs
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES provider_api_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feature_name VARCHAR(100) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_input_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10, 6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS request_data JSONB,
  ADD COLUMN IF NOT EXISTS response_data JSONB,
  ADD COLUMN IF NOT EXISTS model_parameters JSONB;

ALTER TABLE llm_usage_logs
  DROP CONSTRAINT IF EXISTS llm_usage_logs_status_check;
ALTER TABLE llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_status_check
  CHECK (status IN ('success', 'partial', 'failed', 'failure', 'error', 'timeout', 'rate_limited'));

-- ------------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_logs_tenant_idempotency_key
  ON llm_usage_logs(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS idx_llm_usage_logs_tenant_request_id;
CREATE UNIQUE INDEX idx_llm_usage_logs_tenant_request_id
  ON llm_usage_logs(tenant_id, request_id);

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_provider_request_id
  ON llm_usage_logs(provider_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_tenant_id ON llm_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_user_id ON llm_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_provider_id ON llm_usage_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_model_id ON llm_usage_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_feature_name ON llm_usage_logs(feature_name);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_modality ON llm_usage_logs(modality);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_resolved_model ON llm_usage_logs(resolved_model);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_conversation_id ON llm_usage_logs(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_model_message_id ON llm_usage_logs(model_message_id) WHERE model_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_routing_rule_id ON llm_usage_logs(routing_rule_id) WHERE routing_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_parent_usage_log_id ON llm_usage_logs(parent_usage_log_id) WHERE parent_usage_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_status ON llm_usage_logs(status);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_created_at ON llm_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_logs_tenant_date ON llm_usage_logs(tenant_id, created_at DESC);

-- ------------------------------------------------------------------
-- Modality usage tables
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_token_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL DEFAULT 'tokens' CHECK (unit IN ('tokens')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_token_usages_usage_log_id ON llm_token_usages(usage_log_id);

CREATE TABLE IF NOT EXISTS llm_image_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    image_count INTEGER NOT NULL DEFAULT 0,
    size VARCHAR(20),
    quality VARCHAR(20),
    unit VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (unit IN ('image')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_image_usages_usage_log_id ON llm_image_usages(usage_log_id);

CREATE TABLE IF NOT EXISTS llm_video_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    seconds DECIMAL(10, 3) NOT NULL DEFAULT 0,
    size VARCHAR(20),
    unit VARCHAR(20) NOT NULL DEFAULT 'second' CHECK (unit IN ('second')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_video_usages_usage_log_id ON llm_video_usages(usage_log_id);

CREATE TABLE IF NOT EXISTS llm_music_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    seconds DECIMAL(10, 3) NOT NULL DEFAULT 0,
    sample_rate INTEGER,
    channels VARCHAR(20),
    bit_depth INTEGER,
    unit VARCHAR(20) NOT NULL DEFAULT 'second' CHECK (unit IN ('second')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_music_usages_usage_log_id ON llm_music_usages(usage_log_id);

CREATE TABLE IF NOT EXISTS llm_web_search_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usage_log_id UUID NOT NULL REFERENCES llm_usage_logs(id) ON DELETE CASCADE,
    provider VARCHAR(50),
    count INTEGER NOT NULL DEFAULT 0,
    query_chars_total INTEGER DEFAULT 0,
    response_bytes_total BIGINT DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('success', 'failed')),
    error_code VARCHAR(100),
    unit VARCHAR(20) NOT NULL DEFAULT 'request' CHECK (unit IN ('request')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_llm_web_search_usages_usage_log_id ON llm_web_search_usages(usage_log_id);

-- ------------------------------------------------------------------
-- Data migration: model_usage_logs -> llm_usage_logs
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'model_usage_logs'
  ) THEN
    INSERT INTO llm_usage_logs (
      tenant_id,
      user_id,
      provider_id,
      model_id,
      credential_id,
      service_id,
      requested_model,
      resolved_model,
      modality,
      feature_name,
      request_id,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      total_tokens,
      input_cost,
      cached_input_cost,
      output_cost,
      total_cost,
      currency,
      response_time_ms,
      status,
      error_code,
      error_message,
      request_data,
      response_data,
      model_parameters,
      ip_address,
      user_agent,
      metadata,
      created_at
    )
    SELECT
      mul.tenant_id,
      mul.user_id,
      COALESCE(m.provider_id, p.id) AS provider_id,
      mul.model_id,
      mul.credential_id,
      mul.service_id,
      COALESCE(m.model_id, mul.request_data->>'model', 'unknown') AS requested_model,
      COALESCE(m.model_id, mul.request_data->>'model', 'unknown') AS resolved_model,
      CASE
        WHEN m.model_type = 'audio' THEN 'audio'
        WHEN m.model_type = 'music' THEN 'music'
        WHEN m.model_type = 'video' THEN 'video'
        WHEN m.model_type = 'image' THEN 'image_create'
        ELSE 'text'
      END AS modality,
      COALESCE(mul.feature_name, 'unknown') AS feature_name,
      mul.request_id,
      mul.input_tokens,
      mul.cached_input_tokens,
      mul.output_tokens,
      mul.total_tokens,
      mul.input_cost,
      mul.cached_input_cost,
      mul.output_cost,
      mul.total_cost,
      mul.currency,
      mul.response_time_ms,
      mul.status,
      mul.error_code,
      mul.error_message,
      mul.request_data,
      mul.response_data,
      mul.model_parameters,
      mul.ip_address,
      mul.user_agent,
      COALESCE(mul.metadata, '{}'::jsonb) || jsonb_build_object('legacy_model_usage_log_id', mul.id),
      mul.created_at
    FROM model_usage_logs mul
    LEFT JOIN ai_models m ON m.id = mul.model_id
    LEFT JOIN ai_providers p ON p.slug = (mul.request_data->>'provider_slug')
    ON CONFLICT (tenant_id, request_id) DO NOTHING;

    INSERT INTO llm_token_usages (
      usage_log_id,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      unit
    )
    SELECT
      l.id,
      mul.input_tokens,
      mul.cached_input_tokens,
      mul.output_tokens,
      'tokens'
    FROM model_usage_logs mul
    JOIN llm_usage_logs l
      ON l.tenant_id = mul.tenant_id
     AND l.request_id = mul.request_id
    LEFT JOIN llm_token_usages tu ON tu.usage_log_id = l.id
    WHERE tu.id IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- Drop legacy table
-- ------------------------------------------------------------------
DROP TABLE IF EXISTS model_usage_logs CASCADE;

COMMIT;
