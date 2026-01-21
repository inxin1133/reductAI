-- Adds per-user read state for Timeline conversations (unread indicator across devices)
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS model_conversation_reads (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES model_conversations(id) ON DELETE CASCADE,
  last_seen_assistant_order INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_model_conversation_reads_conversation
  ON model_conversation_reads(conversation_id);

