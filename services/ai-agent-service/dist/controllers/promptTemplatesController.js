"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPromptTemplates = listPromptTemplates;
exports.getPromptTemplate = getPromptTemplate;
exports.createPromptTemplate = createPromptTemplate;
exports.updatePromptTemplate = updatePromptTemplate;
exports.deletePromptTemplate = deletePromptTemplate;
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
async function listPromptTemplates(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const purpose = typeof req.query.purpose === "string" ? req.query.purpose.trim() : "";
        const isActive = typeof req.query.is_active === "string" ? req.query.is_active : "";
        const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
        const offset = Math.max(toInt(req.query.offset, 0), 0);
        const where = [`tenant_id = $1`];
        const params = [tenantId];
        if (isActive === "true" || isActive === "false") {
            where.push(`is_active = $${params.length + 1}`);
            params.push(isActive === "true");
        }
        if (purpose) {
            where.push(`purpose = $${params.length + 1}`);
            params.push(purpose);
        }
        if (q) {
            where.push(`name ILIKE $${params.length + 1}`);
            params.push(`%${q}%`);
        }
        const whereSql = `WHERE ${where.join(" AND ")}`;
        const countRes = await (0, db_1.query)(`SELECT COUNT(*)::int AS total FROM prompt_templates ${whereSql}`, params);
        const listRes = await (0, db_1.query)(`
      SELECT
        id, tenant_id, name, purpose, version, is_active, metadata, created_at, updated_at
      FROM prompt_templates
      ${whereSql}
      ORDER BY is_active DESC, purpose ASC, name ASC, version DESC, updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
        return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows });
    }
    catch (e) {
        console.error("listPromptTemplates error:", e);
        return res.status(500).json({ message: "Failed to list prompt templates", details: String(e?.message || e) });
    }
}
async function getPromptTemplate(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`SELECT * FROM prompt_templates WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, row: r.rows[0] });
    }
    catch (e) {
        console.error("getPromptTemplate error:", e);
        return res.status(500).json({ message: "Failed to get prompt template", details: String(e?.message || e) });
    }
}
async function createPromptTemplate(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = req.body || {};
        const name = String(body.name || "").trim();
        const purpose = String(body.purpose || "").trim();
        const version = Number(body.version || 1) || 1;
        const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
        const meta = safeObj(body.metadata);
        const jsonBody = body.body;
        if (!name)
            return res.status(400).json({ message: "name is required" });
        if (!purpose)
            return res.status(400).json({ message: "purpose is required" });
        if (!jsonBody || typeof jsonBody !== "object")
            return res.status(400).json({ message: "body (JSON object) is required" });
        const result = await (0, db_1.query)(`
      INSERT INTO prompt_templates
        (tenant_id, name, purpose, body, version, is_active, metadata)
      VALUES
        ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb)
      RETURNING *
      `, [tenantId, name, purpose, safeJsonb(jsonBody), version, isActive, safeJsonb(meta)]);
        return res.status(201).json({ ok: true, row: result.rows[0] });
    }
    catch (e) {
        console.error("createPromptTemplate error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate template (tenant/name/version already exists)" });
        return res.status(500).json({ message: "Failed to create prompt template", details: String(e?.message || e) });
    }
}
async function updatePromptTemplate(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const body = req.body || {};
        const existing = await (0, db_1.query)(`SELECT id FROM prompt_templates WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        const fields = [];
        const params = [tenantId, id];
        if (body.name !== undefined) {
            params.push(String(body.name || "").trim());
            fields.push(`name = $${params.length}`);
        }
        if (body.purpose !== undefined) {
            params.push(String(body.purpose || "").trim());
            fields.push(`purpose = $${params.length}`);
        }
        if (body.body !== undefined) {
            const b = body.body;
            if (!b || typeof b !== "object")
                return res.status(400).json({ message: "body must be a JSON object" });
            params.push(safeJsonb(b));
            fields.push(`body = $${params.length}::jsonb`);
        }
        if (body.version !== undefined) {
            params.push(Number(body.version || 1) || 1);
            fields.push(`version = $${params.length}`);
        }
        if (body.is_active !== undefined) {
            params.push(Boolean(body.is_active));
            fields.push(`is_active = $${params.length}`);
        }
        if (body.metadata !== undefined) {
            params.push(safeJsonb(safeObj(body.metadata)));
            fields.push(`metadata = $${params.length}::jsonb`);
        }
        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        if (fields.length === 1) {
            // only updated_at would be set; treat as no-op
            const row = await (0, db_1.query)(`SELECT * FROM prompt_templates WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
            return res.json({ ok: true, row: row.rows[0] });
        }
        const sql = `
      UPDATE prompt_templates
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
        const updated = await (0, db_1.query)(sql, params);
        return res.json({ ok: true, row: updated.rows[0] });
    }
    catch (e) {
        console.error("updatePromptTemplate error:", e);
        if (e?.code === "23505")
            return res.status(409).json({ message: "Duplicate template (tenant/name/version already exists)" });
        return res.status(500).json({ message: "Failed to update prompt template", details: String(e?.message || e) });
    }
}
async function deletePromptTemplate(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`DELETE FROM prompt_templates WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, deleted: true, id });
    }
    catch (e) {
        console.error("deletePromptTemplate error:", e);
        return res.status(500).json({ message: "Failed to delete prompt template", details: String(e?.message || e) });
    }
}
