"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPromptSuggestions = listPromptSuggestions;
exports.getPromptSuggestion = getPromptSuggestion;
exports.createPromptSuggestion = createPromptSuggestion;
exports.updatePromptSuggestion = updatePromptSuggestion;
exports.reorderPromptSuggestions = reorderPromptSuggestions;
exports.deletePromptSuggestion = deletePromptSuggestion;
const db_1 = __importStar(require("../config/db"));
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
function normalizeScopeType(v) {
    const s = String(v || "").trim().toUpperCase();
    if (s === "GLOBAL" || s === "ROLE" || s === "TENANT")
        return s;
    return "TENANT";
}
function normalizeModelType(v) {
    const s = String(v || "").trim();
    if (!s)
        return null;
    const allowed = new Set(["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"]);
    return allowed.has(s) ? s : null;
}
async function listPromptSuggestions(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const modelType = typeof req.query.model_type === "string" ? req.query.model_type.trim() : "";
        const isActive = typeof req.query.is_active === "string" ? req.query.is_active : "";
        const scopeType = typeof req.query.scope_type === "string" ? req.query.scope_type.trim().toUpperCase() : "";
        const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 200);
        const offset = Math.max(toInt(req.query.offset, 0), 0);
        const where = [`tenant_id = $1`];
        const params = [tenantId];
        if (isActive === "true" || isActive === "false") {
            where.push(`is_active = $${params.length + 1}`);
            params.push(isActive === "true");
        }
        if (modelType) {
            where.push(`model_type = $${params.length + 1}`);
            params.push(modelType);
        }
        if (scopeType === "GLOBAL" || scopeType === "TENANT" || scopeType === "ROLE") {
            where.push(`scope_type = $${params.length + 1}`);
            params.push(scopeType);
        }
        if (q) {
            where.push(`(title ILIKE $${params.length + 1} OR text ILIKE $${params.length + 1})`);
            params.push(`%${q}%`);
        }
        const whereSql = `WHERE ${where.join(" AND ")}`;
        const countRes = await (0, db_1.query)(`SELECT COUNT(*)::int AS total FROM prompt_suggestions ${whereSql}`, params);
        const listRes = await (0, db_1.query)(`
      SELECT
        id, tenant_id, scope_type, scope_id, model_type, model_id, title, text, sort_order, is_active, metadata, created_at, updated_at
      FROM prompt_suggestions
      ${whereSql}
      ORDER BY is_active DESC, model_type ASC NULLS LAST, sort_order ASC, updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);
        return res.json({ ok: true, total: countRes.rows[0]?.total ?? 0, limit, offset, rows: listRes.rows });
    }
    catch (e) {
        console.error("listPromptSuggestions error:", e);
        return res.status(500).json({ message: "Failed to list prompt suggestions", details: String(e?.message || e) });
    }
}
async function getPromptSuggestion(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`SELECT * FROM prompt_suggestions WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, row: r.rows[0] });
    }
    catch (e) {
        console.error("getPromptSuggestion error:", e);
        return res.status(500).json({ message: "Failed to get prompt suggestion", details: String(e?.message || e) });
    }
}
async function createPromptSuggestion(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = req.body || {};
        const scopeType = normalizeScopeType(body.scope_type);
        const scopeId = body.scope_id === undefined || body.scope_id === null || String(body.scope_id).trim() === "" ? null : String(body.scope_id).trim();
        if (scopeType === "GLOBAL" && scopeId)
            return res.status(400).json({ message: "scope_id must be null when scope_type=GLOBAL" });
        if ((scopeType === "TENANT" || scopeType === "ROLE") && !scopeId)
            return res.status(400).json({ message: "scope_id is required when scope_type=TENANT/ROLE" });
        const modelType = normalizeModelType(body.model_type);
        const modelId = body.model_id === undefined || body.model_id === null || String(body.model_id).trim() === "" ? null : String(body.model_id).trim();
        const title = body.title === undefined || body.title === null || String(body.title).trim() === "" ? null : String(body.title).trim();
        const text = String(body.text || "").trim();
        const sortOrder = Number(body.sort_order ?? 0) || 0;
        const isActive = body.is_active === undefined ? true : Boolean(body.is_active);
        const metadata = safeObj(body.metadata);
        if (!text)
            return res.status(400).json({ message: "text is required" });
        const result = await (0, db_1.query)(`
      INSERT INTO prompt_suggestions
        (tenant_id, scope_type, scope_id, model_type, model_id, title, text, sort_order, is_active, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      RETURNING *
      `, [tenantId, scopeType, scopeId, modelType, modelId, title, text, sortOrder, isActive, safeJsonb(metadata)]);
        return res.status(201).json({ ok: true, row: result.rows[0] });
    }
    catch (e) {
        console.error("createPromptSuggestion error:", e);
        return res.status(500).json({ message: "Failed to create prompt suggestion", details: String(e?.message || e) });
    }
}
async function updatePromptSuggestion(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const body = req.body || {};
        const existing = await (0, db_1.query)(`SELECT id FROM prompt_suggestions WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        const fields = [];
        const params = [tenantId, id];
        if (body.scope_type !== undefined || body.scope_id !== undefined) {
            const scopeType = normalizeScopeType(body.scope_type);
            const scopeId = body.scope_id === undefined || body.scope_id === null || String(body.scope_id).trim() === "" ? null : String(body.scope_id).trim();
            if (scopeType === "GLOBAL" && scopeId)
                return res.status(400).json({ message: "scope_id must be null when scope_type=GLOBAL" });
            if ((scopeType === "TENANT" || scopeType === "ROLE") && !scopeId)
                return res.status(400).json({ message: "scope_id is required when scope_type=TENANT/ROLE" });
            params.push(scopeType);
            fields.push(`scope_type = $${params.length}`);
            params.push(scopeId);
            fields.push(`scope_id = $${params.length}`);
        }
        if (body.model_type !== undefined) {
            params.push(normalizeModelType(body.model_type));
            fields.push(`model_type = $${params.length}`);
        }
        if (body.model_id !== undefined) {
            const v = body.model_id === null || String(body.model_id).trim() === "" ? null : String(body.model_id).trim();
            params.push(v);
            fields.push(`model_id = $${params.length}`);
        }
        if (body.title !== undefined) {
            const v = body.title === null || String(body.title).trim() === "" ? null : String(body.title).trim();
            params.push(v);
            fields.push(`title = $${params.length}`);
        }
        if (body.text !== undefined) {
            const t = String(body.text || "").trim();
            if (!t)
                return res.status(400).json({ message: "text is required" });
            params.push(t);
            fields.push(`text = $${params.length}`);
        }
        if (body.sort_order !== undefined) {
            params.push(Number(body.sort_order ?? 0) || 0);
            fields.push(`sort_order = $${params.length}`);
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
            const row = await (0, db_1.query)(`SELECT * FROM prompt_suggestions WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
            return res.json({ ok: true, row: row.rows[0] });
        }
        const sql = `
      UPDATE prompt_suggestions
      SET ${fields.join(", ")}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
        const updated = await (0, db_1.query)(sql, params);
        return res.json({ ok: true, row: updated.rows[0] });
    }
    catch (e) {
        console.error("updatePromptSuggestion error:", e);
        return res.status(500).json({ message: "Failed to update prompt suggestion", details: String(e?.message || e) });
    }
}
// 순서 변경(드래그 정렬): ordered_ids 순서대로 sort_order 재부여
async function reorderPromptSuggestions(req, res) {
    const client = await db_1.default.connect();
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const { ordered_ids } = (req.body || {});
        if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
            return res.status(400).json({ message: "ordered_ids[] is required" });
        }
        const ids = ordered_ids.map((x) => String(x)).filter(Boolean);
        if (ids.length !== ordered_ids.length)
            return res.status(400).json({ message: "ordered_ids contains invalid id" });
        // tenant_id 검증
        const check = await (0, db_1.query)(`SELECT COUNT(*)::int AS cnt
       FROM prompt_suggestions
       WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [tenantId, ids]);
        if ((check.rows?.[0]?.cnt ?? 0) !== ids.length) {
            return res.status(400).json({ message: "ordered_ids must all belong to this tenant" });
        }
        await client.query("BEGIN");
        for (let i = 0; i < ids.length; i++) {
            await client.query(`UPDATE prompt_suggestions SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $2 AND id = $3`, [i * 10, tenantId, ids[i]]);
        }
        await client.query("COMMIT");
        res.json({ ok: true, count: ids.length });
    }
    catch (e) {
        try {
            await client.query("ROLLBACK");
        }
        catch {
            // ignore
        }
        console.error("reorderPromptSuggestions error:", e);
        res.status(500).json({ message: "Failed to reorder prompt suggestions", details: String(e?.message || e) });
    }
    finally {
        client.release();
    }
}
async function deletePromptSuggestion(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const id = String(req.params.id || "");
        const r = await (0, db_1.query)(`DELETE FROM prompt_suggestions WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        return res.json({ ok: true, deleted: true, id });
    }
    catch (e) {
        console.error("deletePromptSuggestion error:", e);
        return res.status(500).json({ message: "Failed to delete prompt suggestion", details: String(e?.message || e) });
    }
}
