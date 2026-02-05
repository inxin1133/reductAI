import { query } from '../config/db';

const SYSTEM_TENANT_SLUG = 'system';
const SYSTEM_TENANT_NAME = 'System (Platform)';

export async function ensureSystemTenantId(): Promise<string> {
  const existing = await query(
    `SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
    [SYSTEM_TENANT_SLUG]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await query(
    `INSERT INTO tenants (owner_id, name, slug, tenant_type, status, metadata)
     VALUES (NULL, $1, $2, 'group', 'active', $3::jsonb)
     RETURNING id`,
    [SYSTEM_TENANT_NAME, SYSTEM_TENANT_SLUG, JSON.stringify({ system: true })]
  );
  return inserted.rows[0].id;
}
