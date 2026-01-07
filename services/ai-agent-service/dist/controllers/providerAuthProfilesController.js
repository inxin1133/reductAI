"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProviderAuthProfiles = listProviderAuthProfiles;
exports.getProviderAuthProfile = getProviderAuthProfile;
exports.createProviderAuthProfile = createProviderAuthProfile;
exports.updateProviderAuthProfile = updateProviderAuthProfile;
exports.deleteProviderAuthProfile = deleteProviderAuthProfile;
const db_1 = require("../config/db");
const systemTenantService_1 = require("../services/systemTenantService");
function toInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.floor(n);
}
function safeObj(v) {
    if (!v)
        return {};
    if (typeof v === "object" && !Array.isArray(v))
        return v;
    return {};
}
function safeJsonb(v) {
    return JSON.stringify(v ?? {});
}
function normalizeAuthType(v) {
    const s = typeof v === "string" ? v.trim() : "";
    const allowed = new Set(["api_key", "oauth2_service_account", "aws_sigv4", "azure_ad"]);
    return allowed.has(s) ? s : null;
}
async function listProviderAuthProfiles(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const providerId = typeof req.query.provider_id === "string" ? req.query.provider_id.trim() : "";
        const authType = normalizeAuthType(req.query.auth_type);
        const isActive = typeof req.query.is_active === "string" ? req.query.is_active : "";
        const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
        const offset = Math.max(toInt(req.query.offset, 0), 0);
        const where = [`p.tenant_id = $1`];
        const params = [tenantId];
        if (providerId) {
            where.push(`p.provider_id = $${params.length + 1}`);
            params.push(providerId);
        }
        if (authType) {
            where.push(`p.auth_type = $${params.length + 1}`);
            params.push(authType);
        }
        if (isActive === "true" || isActive === "false") {
            where.push(`p.is_active = $${params.length + 1}`);
            params.push(isActive === "true");
        }
        if (q) {
            where.push(`(p.profile_key ILIKE $${params.length + 1})`);
            params.push(`%${q}%`);
        }
        const whereSql = `WHERE ${where.join(" AND ")}`;
        const countRes = await (0, db_1.query)(`SELECT COUNT(*)::int AS total FROM provider_auth_profiles p ${whereSql}`, params);
        const listRes = await (0, db_1.query)(`
      SELECT
        p.id,
        p.tenant_id,
        p.provider_id,
        pr.product_name AS provider_product_name,
        pr.slug AS provider_slug,
        p.profile_key,
        p.auth_type,
        p.credential_id,
        c.credential_name,
        p.token_cache_key,
        p.is_active,
        p.created_at,
        p.updated_at,
        p.config
      FROM provider_auth_profiles p
      JOIN ai_providers pr ON pr.id = p.provider_id
      JOIN provider_api_credentials c ON c.id = p.credential_id
      ${whereSql}
      ORDER BY p.is_active DESC, p.provider_id ASC, p.profile_key ASC, p.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
        return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows });
    }
    catch (e) {
        console.error("listProviderAuthProfiles error:", e);
        return res.status(500).json({ message: "Failed to list provider auth profiles", details: String(e?.message || e) });
    }
}
async function getProviderAuthProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`SELECT * FROM provider_auth_profiles WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, row: r.rows[0] });
    }
    catch (e) {
        console.error("getProviderAuthProfile error:", e);
        return res.status(500).json({ message: "Failed to get provider auth profile", details: String(e?.message || e) });
    }
}
async function createProviderAuthProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = req.body || {};
        const providerId = String(body.provider_id || "").trim();
        const profileKey = String(body.profile_key || "").trim();
        const authType = normalizeAuthType(body.auth_type);
        const credentialId = String(body.credential_id || "").trim();
        const tokenCacheKey = body.token_cache_key ? String(body.token_cache_key).trim() : null;
        const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
        const config = safeObj(body.config);
        if (!providerId)
            return res.status(400).json({ message: "provider_id is required" });
        if (!profileKey)
            return res.status(400).json({ message: "profile_key is required" });
        if (!authType)
            return res.status(400).json({ message: "auth_type is required" });
        if (!credentialId)
            return res.status(400).json({ message: "credential_id is required" });
        const result = await (0, db_1.query)(`
      INSERT INTO provider_auth_profiles
        (tenant_id, provider_id, profile_key, auth_type, credential_id, config, token_cache_key, is_active)
      VALUES
        ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
      RETURNING *
      `, [tenantId, providerId, profileKey, authType, credentialId, safeJsonb(config), tokenCacheKey, isActive]);
        return res.status(201).json({ ok: true, row: result.rows[0] });
    }
    catch (e) {
        console.error("createProviderAuthProfile error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate auth profile (tenant/provider/profile_key already exists)" });
        return res.status(500).json({ message: "Failed to create provider auth profile", details: String(e?.message || e) });
    }
}
async function updateProviderAuthProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const body = req.body || {};
        const existing = await (0, db_1.query)(`SELECT id FROM provider_auth_profiles WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        const fields = [];
        const params = [tenantId, id];
        if (body.provider_id !== undefined) {
            params.push(String(body.provider_id || "").trim());
            fields.push(`provider_id = $${params.length}`);
        }
        if (body.profile_key !== undefined) {
            params.push(String(body.profile_key || "").trim());
            fields.push(`profile_key = $${params.length}`);
        }
        if (body.auth_type !== undefined) {
            const t = normalizeAuthType(body.auth_type);
            if (!t)
                return res.status(400).json({ message: "auth_type is invalid" });
            params.push(t);
            fields.push(`auth_type = $${params.length}`);
        }
        if (body.credential_id !== undefined) {
            params.push(String(body.credential_id || "").trim());
            fields.push(`credential_id = $${params.length}`);
        }
        if (body.token_cache_key !== undefined) {
            params.push(body.token_cache_key ? String(body.token_cache_key).trim() : null);
            fields.push(`token_cache_key = $${params.length}`);
        }
        if (body.config !== undefined) {
            params.push(safeJsonb(safeObj(body.config)));
            fields.push(`config = $${params.length}::jsonb`);
        }
        if (body.is_active !== undefined) {
            params.push(Boolean(body.is_active));
            fields.push(`is_active = $${params.length}`);
        }
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        if (fields.length === 1) {
            const row = await (0, db_1.query)(`SELECT * FROM provider_auth_profiles WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
            return res.json({ ok: true, row: row.rows[0] });
        }
        const sql = `
      UPDATE provider_auth_profiles
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
        const updated = await (0, db_1.query)(sql, params);
        return res.json({ ok: true, row: updated.rows[0] });
    }
    catch (e) {
        console.error("updateProviderAuthProfile error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate auth profile (tenant/provider/profile_key already exists)" });
        return res.status(500).json({ message: "Failed to update provider auth profile", details: String(e?.message || e) });
    }
}
async function deleteProviderAuthProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`DELETE FROM provider_auth_profiles WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, deleted: true, id });
    }
    catch (e) {
        console.error("deleteProviderAuthProfile error:", e);
        return res.status(500).json({ message: "Failed to delete provider auth profile", details: String(e?.message || e) });
    }
}
