"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSystemTenantId = ensureSystemTenantId;
const db_1 = require("../config/db");
const SYSTEM_TENANT_SLUG = "system";
const SYSTEM_TENANT_NAME = "System (Platform)";
async function ensureSystemTenantId() {
    const existing = await (0, db_1.query)(`SELECT id FROM tenants WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`, [
        SYSTEM_TENANT_SLUG,
    ]);
    if (existing.rows.length > 0)
        return existing.rows[0].id;
    const inserted = await (0, db_1.query)(`INSERT INTO tenants (owner_id, name, slug, tenant_type, status, metadata)
     VALUES (NULL, $1, $2, 'enterprise', 'active', $3::jsonb)
     RETURNING id`, [SYSTEM_TENANT_NAME, SYSTEM_TENANT_SLUG, JSON.stringify({ system: true })]);
    return inserted.rows[0].id;
}
