"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listModelApiProfiles = listModelApiProfiles;
exports.getModelApiProfile = getModelApiProfile;
exports.createModelApiProfile = createModelApiProfile;
exports.updateModelApiProfile = updateModelApiProfile;
exports.deleteModelApiProfile = deleteModelApiProfile;
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
function normalizePurpose(v) {
    const s = typeof v === "string" ? v.trim() : "";
    const allowed = new Set(["chat", "image", "video", "audio", "music", "multimodal", "embedding", "code"]);
    return allowed.has(s) ? s : null;
}
async function listModelApiProfiles(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const providerId = typeof req.query.provider_id === "string" ? req.query.provider_id.trim() : "";
        const modelId = typeof req.query.model_id === "string" ? req.query.model_id.trim() : "";
        const purpose = normalizePurpose(req.query.purpose);
        const isActive = typeof req.query.is_active === "string" ? req.query.is_active : "";
        const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
        const offset = Math.max(toInt(req.query.offset, 0), 0);
        const where = [`tenant_id = $1`];
        const params = [tenantId];
        if (providerId) {
            where.push(`provider_id = $${params.length + 1}`);
            params.push(providerId);
        }
        if (modelId) {
            where.push(`model_id = $${params.length + 1}`);
            params.push(modelId);
        }
        if (purpose) {
            where.push(`purpose = $${params.length + 1}`);
            params.push(purpose);
        }
        if (isActive === "true" || isActive === "false") {
            where.push(`is_active = $${params.length + 1}`);
            params.push(isActive === "true");
        }
        if (q) {
            where.push(`(profile_key ILIKE $${params.length + 1})`);
            params.push(`%${q}%`);
        }
        const whereSql = `WHERE ${where.join(" AND ")}`;
        const countRes = await (0, db_1.query)(`SELECT COUNT(*)::int AS total FROM model_api_profiles ${whereSql}`, params);
        const listRes = await (0, db_1.query)(`
      SELECT
        id, tenant_id, provider_id, model_id, profile_key, purpose,
        is_active, created_at, updated_at
      FROM model_api_profiles
      ${whereSql}
      ORDER BY is_active DESC, purpose ASC, profile_key ASC, updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
        return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows });
    }
    catch (e) {
        console.error("listModelApiProfiles error:", e);
        return res.status(500).json({ message: "Failed to list model api profiles", details: String(e?.message || e) });
    }
}
async function getModelApiProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`SELECT * FROM model_api_profiles WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, row: r.rows[0] });
    }
    catch (e) {
        console.error("getModelApiProfile error:", e);
        return res.status(500).json({ message: "Failed to get model api profile", details: String(e?.message || e) });
    }
}
async function createModelApiProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = req.body || {};
        const providerId = String(body.provider_id || "").trim();
        const modelId = body.model_id ? String(body.model_id).trim() : null;
        const profileKey = String(body.profile_key || "").trim();
        const purpose = normalizePurpose(body.purpose);
        const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
        const authProfileId = body.auth_profile_id ? String(body.auth_profile_id).trim() : null;
        const transport = safeObj(body.transport);
        const responseMapping = safeObj(body.response_mapping);
        const workflow = safeObj(body.workflow);
        if (!providerId)
            return res.status(400).json({ message: "provider_id is required" });
        if (!profileKey)
            return res.status(400).json({ message: "profile_key is required" });
        if (!purpose)
            return res.status(400).json({ message: "purpose is required" });
        if (Object.keys(transport).length === 0)
            return res.status(400).json({ message: "transport (JSON object) is required" });
        if (Object.keys(responseMapping).length === 0)
            return res.status(400).json({ message: "response_mapping (JSON object) is required" });
        const result = await (0, db_1.query)(`
      INSERT INTO model_api_profiles
        (tenant_id, provider_id, model_id, profile_key, purpose, auth_profile_id, transport, response_mapping, workflow, is_active)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
      RETURNING *
      `, [
            tenantId,
            providerId,
            modelId,
            profileKey,
            purpose,
            authProfileId,
            safeJsonb(transport),
            safeJsonb(responseMapping),
            safeJsonb(workflow),
            isActive,
        ]);
        return res.status(201).json({ ok: true, row: result.rows[0] });
    }
    catch (e) {
        console.error("createModelApiProfile error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate profile (tenant/provider/profile_key already exists)" });
        return res.status(500).json({ message: "Failed to create model api profile", details: String(e?.message || e) });
    }
}
async function updateModelApiProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const body = req.body || {};
        const existing = await (0, db_1.query)(`SELECT id FROM model_api_profiles WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        const fields = [];
        const params = [tenantId, id];
        if (body.provider_id !== undefined) {
            params.push(String(body.provider_id || "").trim());
            fields.push(`provider_id = $${params.length}`);
        }
        if (body.model_id !== undefined) {
            params.push(body.model_id ? String(body.model_id).trim() : null);
            fields.push(`model_id = $${params.length}`);
        }
        if (body.profile_key !== undefined) {
            params.push(String(body.profile_key || "").trim());
            fields.push(`profile_key = $${params.length}`);
        }
        if (body.purpose !== undefined) {
            const p = normalizePurpose(body.purpose);
            if (!p)
                return res.status(400).json({ message: "purpose is invalid" });
            params.push(p);
            fields.push(`purpose = $${params.length}`);
        }
        if (body.auth_profile_id !== undefined) {
            params.push(body.auth_profile_id ? String(body.auth_profile_id).trim() : null);
            fields.push(`auth_profile_id = $${params.length}`);
        }
        if (body.transport !== undefined) {
            const t = safeObj(body.transport);
            if (Object.keys(t).length === 0)
                return res.status(400).json({ message: "transport must be a JSON object" });
            params.push(safeJsonb(t));
            fields.push(`transport = $${params.length}::jsonb`);
        }
        if (body.response_mapping !== undefined) {
            const rm = safeObj(body.response_mapping);
            if (Object.keys(rm).length === 0)
                return res.status(400).json({ message: "response_mapping must be a JSON object" });
            params.push(safeJsonb(rm));
            fields.push(`response_mapping = $${params.length}::jsonb`);
        }
        if (body.workflow !== undefined) {
            params.push(safeJsonb(safeObj(body.workflow)));
            fields.push(`workflow = $${params.length}::jsonb`);
        }
        if (body.is_active !== undefined) {
            params.push(Boolean(body.is_active));
            fields.push(`is_active = $${params.length}`);
        }
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        if (fields.length === 1) {
            const row = await (0, db_1.query)(`SELECT * FROM model_api_profiles WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
            return res.json({ ok: true, row: row.rows[0] });
        }
        const sql = `
      UPDATE model_api_profiles
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
        const updated = await (0, db_1.query)(sql, params);
        return res.json({ ok: true, row: updated.rows[0] });
    }
    catch (e) {
        console.error("updateModelApiProfile error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate profile (tenant/provider/profile_key already exists)" });
        return res.status(500).json({ message: "Failed to update model api profile", details: String(e?.message || e) });
    }
}
async function deleteModelApiProfile(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`DELETE FROM model_api_profiles WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, deleted: true, id });
    }
    catch (e) {
        console.error("deleteModelApiProfile error:", e);
        return res.status(500).json({ message: "Failed to delete model api profile", details: String(e?.message || e) });
    }
}
