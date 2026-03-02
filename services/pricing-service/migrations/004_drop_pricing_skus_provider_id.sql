-- Drop pricing_skus.provider_id (redundant: provider can be derived from model_id or provider_slug)
-- Serper and other non-LLM features have provider_id=null; column has no discriminative value.

ALTER TABLE pricing_skus DROP COLUMN IF EXISTS provider_id;
