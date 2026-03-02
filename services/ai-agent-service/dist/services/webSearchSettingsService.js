"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WEB_SEARCH_POLICY = void 0;
exports.normalizeWebSearchPolicy = normalizeWebSearchPolicy;
exports.getWebSearchPolicy = getWebSearchPolicy;
exports.upsertWebSearchPolicy = upsertWebSearchPolicy;
const db_1 = require("../config/db");
exports.DEFAULT_WEB_SEARCH_POLICY = {
    enabled: true,
    default_allowed: false,
    provider: "serper",
    enabled_providers: ["openai", "google", "anthropic"],
    max_search_calls: 3,
    max_total_snippet_tokens: 1200,
    timeout_ms: 10000,
    retry_max: 2,
    retry_base_delay_ms: 500,
    retry_max_delay_ms: 2000,
};
function clampInt(n, min, max) {
    if (!Number.isFinite(n))
        return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}
function normalizeProviderList(list) {
    if (!Array.isArray(list))
        return [...exports.DEFAULT_WEB_SEARCH_POLICY.enabled_providers];
    const out = [];
    for (const raw of list) {
        const s = String(raw || "").trim().toLowerCase();
        if (!s)
            continue;
        if (!out.includes(s))
            out.push(s);
    }
    return out.length ? out : [...exports.DEFAULT_WEB_SEARCH_POLICY.enabled_providers];
}
function normalizeWebSearchPolicy(input) {
    const src = input || {};
    const enabled = typeof src.enabled === "boolean" ? src.enabled : exports.DEFAULT_WEB_SEARCH_POLICY.enabled;
    const defaultAllowed = typeof src.default_allowed === "boolean" ? src.default_allowed : exports.DEFAULT_WEB_SEARCH_POLICY.default_allowed;
    const provider = typeof src.provider === "string" && src.provider.trim() ? src.provider.trim() : exports.DEFAULT_WEB_SEARCH_POLICY.provider;
    const enabledProviders = normalizeProviderList(src.enabled_providers);
    const maxSearchCalls = clampInt(Number(src.max_search_calls ?? exports.DEFAULT_WEB_SEARCH_POLICY.max_search_calls), 1, 10);
    const maxTotalSnippetTokens = clampInt(Number(src.max_total_snippet_tokens ?? exports.DEFAULT_WEB_SEARCH_POLICY.max_total_snippet_tokens), 200, 5000);
    const timeoutMs = clampInt(Number(src.timeout_ms ?? exports.DEFAULT_WEB_SEARCH_POLICY.timeout_ms), 1000, 60000);
    const retryMax = clampInt(Number(src.retry_max ?? exports.DEFAULT_WEB_SEARCH_POLICY.retry_max), 0, 5);
    const retryBaseDelayMs = clampInt(Number(src.retry_base_delay_ms ?? exports.DEFAULT_WEB_SEARCH_POLICY.retry_base_delay_ms), 100, 10000);
    const retryMaxDelayMs = clampInt(Number(src.retry_max_delay_ms ?? exports.DEFAULT_WEB_SEARCH_POLICY.retry_max_delay_ms), 200, 20000);
    return {
        enabled,
        default_allowed: defaultAllowed,
        provider,
        enabled_providers: enabledProviders,
        max_search_calls: maxSearchCalls,
        max_total_snippet_tokens: maxTotalSnippetTokens,
        timeout_ms: timeoutMs,
        retry_max: retryMax,
        retry_base_delay_ms: retryBaseDelayMs,
        retry_max_delay_ms: retryMaxDelayMs,
    };
}
async function getWebSearchPolicy(tenantId) {
    const rows = await (0, db_1.query)(`
    SELECT
      enabled,
      default_allowed,
      provider,
      enabled_providers,
      max_search_calls,
      max_total_snippet_tokens,
      timeout_ms,
      retry_max,
      retry_base_delay_ms,
      retry_max_delay_ms
    FROM ai_web_search_settings
    WHERE tenant_id = $1
    LIMIT 1
    `, [tenantId]);
    if (!rows.rows.length)
        return exports.DEFAULT_WEB_SEARCH_POLICY;
    const row = rows.rows[0];
    return normalizeWebSearchPolicy({
        enabled: Boolean(row.enabled),
        default_allowed: Boolean(row.default_allowed),
        provider: typeof row.provider === "string" ? row.provider : exports.DEFAULT_WEB_SEARCH_POLICY.provider,
        enabled_providers: Array.isArray(row.enabled_providers) ? row.enabled_providers : exports.DEFAULT_WEB_SEARCH_POLICY.enabled_providers,
        max_search_calls: Number(row.max_search_calls),
        max_total_snippet_tokens: Number(row.max_total_snippet_tokens),
        timeout_ms: Number(row.timeout_ms),
        retry_max: Number(row.retry_max),
        retry_base_delay_ms: Number(row.retry_base_delay_ms),
        retry_max_delay_ms: Number(row.retry_max_delay_ms),
    });
}
async function upsertWebSearchPolicy(tenantId, input) {
    const normalized = normalizeWebSearchPolicy(input || {});
    const row = await (0, db_1.query)(`
    INSERT INTO ai_web_search_settings (
      tenant_id,
      enabled,
      default_allowed,
      provider,
      enabled_providers,
      max_search_calls,
      max_total_snippet_tokens,
      timeout_ms,
      retry_max,
      retry_base_delay_ms,
      retry_max_delay_ms
    ) VALUES (
      $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      default_allowed = EXCLUDED.default_allowed,
      provider = EXCLUDED.provider,
      enabled_providers = EXCLUDED.enabled_providers,
      max_search_calls = EXCLUDED.max_search_calls,
      max_total_snippet_tokens = EXCLUDED.max_total_snippet_tokens,
      timeout_ms = EXCLUDED.timeout_ms,
      retry_max = EXCLUDED.retry_max,
      retry_base_delay_ms = EXCLUDED.retry_base_delay_ms,
      retry_max_delay_ms = EXCLUDED.retry_max_delay_ms,
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      enabled,
      default_allowed,
      provider,
      enabled_providers,
      max_search_calls,
      max_total_snippet_tokens,
      timeout_ms,
      retry_max,
      retry_base_delay_ms,
      retry_max_delay_ms
    `, [
        tenantId,
        normalized.enabled,
        normalized.default_allowed,
        normalized.provider,
        JSON.stringify(normalized.enabled_providers),
        normalized.max_search_calls,
        normalized.max_total_snippet_tokens,
        normalized.timeout_ms,
        normalized.retry_max,
        normalized.retry_base_delay_ms,
        normalized.retry_max_delay_ms,
    ]);
    if (!row.rows.length)
        return normalized;
    const saved = row.rows[0];
    return normalizeWebSearchPolicy({
        enabled: Boolean(saved.enabled),
        default_allowed: Boolean(saved.default_allowed),
        provider: typeof saved.provider === "string" ? saved.provider : normalized.provider,
        enabled_providers: Array.isArray(saved.enabled_providers) ? saved.enabled_providers : normalized.enabled_providers,
        max_search_calls: Number(saved.max_search_calls),
        max_total_snippet_tokens: Number(saved.max_total_snippet_tokens),
        timeout_ms: Number(saved.timeout_ms),
        retry_max: Number(saved.retry_max),
        retry_base_delay_ms: Number(saved.retry_base_delay_ms),
        retry_max_delay_ms: Number(saved.retry_max_delay_ms),
    });
}
