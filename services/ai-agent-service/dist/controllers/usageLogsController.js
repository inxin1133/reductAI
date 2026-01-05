"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsageLogs = listUsageLogs;
exports.getUsageLog = getUsageLog;
const db_1 = require("../config/db");
const systemTenantService_1 = require("../services/systemTenantService");
function toInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(0, Math.floor(n));
}
function toStr(v) {
    const s = typeof v === "string" ? v : "";
    return s.trim();
}
async function listUsageLogs(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const q = toStr(req.query.q);
        const status = toStr(req.query.status);
        const feature = toStr(req.query.feature_name);
        const providerSlug = toStr(req.query.provider_slug);
        const modelApiId = toStr(req.query.model_id);
        const from = toStr(req.query.from);
        const to = toStr(req.query.to);
        const limit = Math.min(toInt(req.query.limit, 50), 200);
        const offset = toInt(req.query.offset, 0);
        const where = [`l.tenant_id = $1`];
        const params = [tenantId];
        if (status) {
            where.push(`l.status = $${params.length + 1}`);
            params.push(status);
        }
        if (feature) {
            where.push(`l.feature_name = $${params.length + 1}`);
            params.push(feature);
        }
        if (providerSlug) {
            where.push(`p.slug = $${params.length + 1}`);
            params.push(providerSlug);
        }
        if (modelApiId) {
            where.push(`m.model_id = $${params.length + 1}`);
            params.push(modelApiId);
        }
        if (from) {
            where.push(`l.created_at >= $${params.length + 1}::timestamptz`);
            params.push(from);
        }
        if (to) {
            where.push(`l.created_at <= $${params.length + 1}::timestamptz`);
            params.push(to);
        }
        if (q) {
            where.push(`(
          l.request_id ILIKE $${params.length + 1}
          OR l.error_message ILIKE $${params.length + 1}
          OR m.display_name ILIKE $${params.length + 1}
          OR m.model_id ILIKE $${params.length + 1}
          OR p.slug ILIKE $${params.length + 1}
        )`);
            params.push(`%${q}%`);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const countRes = await (0, db_1.query)(`
      SELECT COUNT(*)::int AS total
      FROM model_usage_logs l
      JOIN ai_models m ON m.id = l.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      ${whereSql}
      `, params);
        const listRes = await (0, db_1.query)(`
      SELECT
        l.id,
        l.created_at,
        l.status,
        l.feature_name,
        l.request_id,
        l.input_tokens,
        l.output_tokens,
        l.total_tokens,
        l.total_cost,
        l.currency,
        l.response_time_ms,
        l.error_code,
        l.error_message,
        l.user_id,
        u.email AS user_email,
        m.id AS ai_model_id,
        m.display_name AS model_display_name,
        m.model_id AS model_api_id,
        p.slug AS provider_slug
      FROM model_usage_logs l
      JOIN ai_models m ON m.id = l.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      LEFT JOIN users u ON u.id = l.user_id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
        return res.json({
            ok: true,
            total: countRes.rows[0]?.total ?? 0,
            limit,
            offset,
            rows: listRes.rows,
        });
    }
    catch (e) {
        console.error("listUsageLogs error:", e);
        return res.status(500).json({ message: "Failed to list usage logs", details: String(e?.message || e) });
    }
}
async function getUsageLog(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        if (!id)
            return res.status(400).json({ message: "id is required" });
        const r = await (0, db_1.query)(`
      SELECT
        l.*,
        u.email AS user_email,
        m.display_name AS model_display_name,
        m.model_id AS model_api_id,
        p.slug AS provider_slug
      FROM model_usage_logs l
      JOIN ai_models m ON m.id = l.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.tenant_id = $1 AND l.id = $2
      LIMIT 1
      `, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, row: r.rows[0] });
    }
    catch (e) {
        console.error("getUsageLog error:", e);
        return res.status(500).json({ message: "Failed to get usage log", details: String(e?.message || e) });
    }
}
