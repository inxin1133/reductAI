-- Backfill provider_family from slug for providers that still have 'custom'.
-- Enables correct API client routing for modality-specific slugs (google-nanobanana, openai-chatgpt, etc.).
-- Run manually or via schemaBootstrap if needed:

UPDATE ai_providers
SET provider_family = lower(split_part(slug, '-', 1))
WHERE (provider_family IS NULL OR btrim(provider_family) = '' OR lower(provider_family) = 'custom')
  AND lower(split_part(slug, '-', 1)) IN ('openai', 'anthropic', 'google');
