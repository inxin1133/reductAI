-- ============================================
-- Migrate system-tenant data to user's primary tenant
-- 2026-02-05
-- ============================================

WITH system_tenant AS (
  SELECT id FROM tenants WHERE slug = 'system' LIMIT 1
),
primary_members AS (
  SELECT user_id, tenant_id
  FROM user_tenant_roles
  WHERE is_primary_tenant = TRUE
)
UPDATE file_assets fa
SET tenant_id = pm.tenant_id
FROM system_tenant st, primary_members pm
WHERE fa.tenant_id = st.id
  AND fa.user_id = pm.user_id;

WITH system_tenant AS (
  SELECT id FROM tenants WHERE slug = 'system' LIMIT 1
),
primary_members AS (
  SELECT user_id, tenant_id
  FROM user_tenant_roles
  WHERE is_primary_tenant = TRUE
)
UPDATE board_categories bc
SET tenant_id = pm.tenant_id
FROM system_tenant st, primary_members pm
WHERE bc.tenant_id = st.id
  AND COALESCE(bc.user_id, bc.author_id) = pm.user_id;

WITH system_tenant AS (
  SELECT id FROM tenants WHERE slug = 'system' LIMIT 1
),
primary_members AS (
  SELECT user_id, tenant_id
  FROM user_tenant_roles
  WHERE is_primary_tenant = TRUE
)
UPDATE posts p
SET tenant_id = pm.tenant_id
FROM system_tenant st, primary_members pm
WHERE p.tenant_id = st.id
  AND p.author_id = pm.user_id;
