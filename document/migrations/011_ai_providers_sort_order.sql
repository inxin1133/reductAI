-- Add sort_order to ai_providers for provider card ordering in Chat UI.
-- Applied automatically via schemaBootstrap on ai-agent-service startup.
-- Run manually if column is missing:

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_providers' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE ai_providers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_providers_sort_order ON ai_providers(sort_order);
