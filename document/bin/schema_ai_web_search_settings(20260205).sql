-- Web search settings (admin policy)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS ai_web_search_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    provider VARCHAR(50) NOT NULL DEFAULT 'serper',
    enabled_providers JSONB NOT NULL DEFAULT '["openai","google","anthropic"]',
    max_search_calls INTEGER NOT NULL DEFAULT 3,
    max_total_snippet_tokens INTEGER NOT NULL DEFAULT 1200,
    timeout_ms INTEGER NOT NULL DEFAULT 10000,
    retry_max INTEGER NOT NULL DEFAULT 2,
    retry_base_delay_ms INTEGER NOT NULL DEFAULT 500,
    retry_max_delay_ms INTEGER NOT NULL DEFAULT 2000,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id)
);
