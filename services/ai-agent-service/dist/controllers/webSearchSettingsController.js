"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebSearchSettings = getWebSearchSettings;
exports.updateWebSearchSettings = updateWebSearchSettings;
const systemTenantService_1 = require("../services/systemTenantService");
const webSearchSettingsService_1 = require("../services/webSearchSettingsService");
async function getWebSearchSettings(_req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const policy = await (0, webSearchSettingsService_1.getWebSearchPolicy)(tenantId);
        return res.json({ ok: true, row: policy });
    }
    catch (e) {
        console.error("getWebSearchSettings error:", e);
        return res.status(500).json({ message: "Failed to get web search settings", details: String(e?.message || e) });
    }
}
async function updateWebSearchSettings(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = (req.body && typeof req.body === "object" ? req.body : {}) || {};
        const normalized = (0, webSearchSettingsService_1.normalizeWebSearchPolicy)({
            enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
            default_allowed: typeof body.default_allowed === "boolean" ? body.default_allowed : undefined,
            provider: typeof body.provider === "string" ? body.provider : undefined,
            enabled_providers: Array.isArray(body.enabled_providers) ? body.enabled_providers : undefined,
            max_search_calls: typeof body.max_search_calls === "number" ? body.max_search_calls : undefined,
            max_total_snippet_tokens: typeof body.max_total_snippet_tokens === "number" ? body.max_total_snippet_tokens : undefined,
            timeout_ms: typeof body.timeout_ms === "number" ? body.timeout_ms : undefined,
            retry_max: typeof body.retry_max === "number" ? body.retry_max : undefined,
            retry_base_delay_ms: typeof body.retry_base_delay_ms === "number" ? body.retry_base_delay_ms : undefined,
            retry_max_delay_ms: typeof body.retry_max_delay_ms === "number" ? body.retry_max_delay_ms : undefined,
        });
        const saved = await (0, webSearchSettingsService_1.upsertWebSearchPolicy)(tenantId, normalized);
        return res.json({ ok: true, row: saved });
    }
    catch (e) {
        console.error("updateWebSearchSettings error:", e);
        return res.status(500).json({ message: "Failed to update web search settings", details: String(e?.message || e) });
    }
}
