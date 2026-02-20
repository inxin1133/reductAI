-- Normalize tenant slugs to 24 chars, remove personal- prefix, slugify to [a-z0-9-].
-- Applies to slugs that are too long or start with "personal-".
BEGIN;

WITH target AS (
  SELECT
    id,
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      '-{2,}',
      '-',
      'g'
    ) AS name_slug,
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(regexp_replace(slug, '^personal-', '')), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      '-{2,}',
      '-',
      'g'
    ) AS slug_slug,
    left(replace(id::text, '-', ''), 6) AS suffix,
    24 - (6 + 1) AS max_base_len
  FROM tenants
  WHERE slug LIKE 'personal-%' OR length(slug) > 24
),
resolved AS (
  SELECT
    id,
    COALESCE(NULLIF(name_slug, ''), NULLIF(slug_slug, ''), '') AS base_slug,
    suffix,
    max_base_len
  FROM target
)
UPDATE tenants t
SET slug = CASE
  WHEN resolved.max_base_len <= 0 THEN resolved.suffix
  WHEN resolved.base_slug IS NULL OR resolved.base_slug = '' THEN resolved.suffix
  WHEN length(resolved.base_slug) <= resolved.max_base_len THEN resolved.base_slug || '-' || resolved.suffix
  ELSE
    CASE
      WHEN regexp_replace(left(resolved.base_slug, resolved.max_base_len), '-+$', '', 'g') = '' THEN resolved.suffix
      ELSE regexp_replace(left(resolved.base_slug, resolved.max_base_len), '-+$', '', 'g') || '-' || resolved.suffix
    END
END,
    updated_at = CURRENT_TIMESTAMP
FROM resolved
WHERE t.id = resolved.id;

COMMIT;
