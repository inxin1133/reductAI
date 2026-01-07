"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAuthForModelApiProfile = resolveAuthForModelApiProfile;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../config/db");
const systemTenantService_1 = require("./systemTenantService");
const cryptoService_1 = require("./cryptoService");
const accessTokenCache = new Map();
function safeObj(v) {
    if (!v)
        return {};
    if (typeof v === "object" && !Array.isArray(v))
        return v;
    return {};
}
function base64Url(buf) {
    return buf
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}
function signJwtRs256(args) {
    const h = base64Url(Buffer.from(JSON.stringify(args.header)));
    const p = base64Url(Buffer.from(JSON.stringify(args.payload)));
    const data = `${h}.${p}`;
    const signer = crypto_1.default.createSign("RSA-SHA256");
    signer.update(data);
    signer.end();
    const sig = signer.sign(args.privateKeyPem);
    return `${data}.${base64Url(sig)}`;
}
function nowSec() {
    return Math.floor(Date.now() / 1000);
}
function asString(v) {
    return typeof v === "string" ? v : "";
}
function asStringArray(v) {
    if (Array.isArray(v))
        return v.map((x) => (typeof x === "string" ? x : "")).filter(Boolean);
    if (typeof v === "string" && v.trim())
        return [v.trim()];
    return [];
}
async function loadAuthProfileById(args) {
    const r = await (0, db_1.query)(`SELECT id, tenant_id, provider_id, profile_key, auth_type, credential_id, config, token_cache_key
     FROM provider_auth_profiles
     WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE
     LIMIT 1`, [args.tenantId, args.authProfileId]);
    if (r.rows.length === 0)
        return null;
    const row = (r.rows[0] || {});
    return {
        id: String(row.id || ""),
        tenant_id: String(row.tenant_id || ""),
        provider_id: String(row.provider_id || ""),
        profile_key: String(row.profile_key || ""),
        auth_type: String(row.auth_type || "api_key"),
        credential_id: String(row.credential_id || ""),
        config: safeObj(row.config),
        token_cache_key: row.token_cache_key ? String(row.token_cache_key) : null,
    };
}
async function loadCredentialById(args) {
    const r = await (0, db_1.query)(`SELECT id, api_key_encrypted, endpoint_url, organization_id, metadata
     FROM provider_api_credentials
     WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE
     LIMIT 1`, [args.tenantId, args.credentialId]);
    if (r.rows.length === 0)
        throw new Error("NO_ACTIVE_CREDENTIAL_FOR_AUTH_PROFILE");
    const row = (r.rows[0] || {});
    const decrypted = (0, cryptoService_1.decryptApiKey)(String(row.api_key_encrypted || ""));
    return {
        id: String(row.id || ""),
        secretRaw: decrypted,
        endpointUrl: row.endpoint_url ? String(row.endpoint_url) : null,
        organizationId: row.organization_id ? String(row.organization_id) : null,
        metadata: safeObj(row.metadata),
    };
}
async function fetchGoogleAccessTokenFromServiceAccount(args) {
    const privateKey = asString(args.saJson.private_key);
    const clientEmail = asString(args.saJson.client_email);
    if (!privateKey || !clientEmail)
        throw new Error("SERVICE_ACCOUNT_PRIVATE_KEY_OR_CLIENT_EMAIL_MISSING");
    const tokenUrl = args.tokenUrl || "https://oauth2.googleapis.com/token";
    const aud = args.audience || tokenUrl;
    const iat = nowSec();
    const exp = iat + 3600;
    const assertion = signJwtRs256({
        privateKeyPem: privateKey,
        header: { alg: "RS256", typ: "JWT" },
        payload: {
            iss: clientEmail,
            scope: (args.scopes && args.scopes.length ? args.scopes : ["https://www.googleapis.com/auth/cloud-platform"]).join(" "),
            aud,
            iat,
            exp,
        },
    });
    const body = new URLSearchParams();
    body.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
    body.set("assertion", assertion);
    const res = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error(`GOOGLE_OAUTH_TOKEN_FAILED_${res.status}:${JSON.stringify(json)}`);
    const accessToken = typeof json.access_token === "string" ? json.access_token : "";
    const expiresIn = Number(json.expires_in || 0) || 0;
    if (!accessToken)
        throw new Error("GOOGLE_OAUTH_TOKEN_MISSING_ACCESS_TOKEN");
    return { accessToken, expiresInSec: expiresIn || 3600 };
}
async function resolveAuthForModelApiProfile(args) {
    const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
    // default behavior: existing api_key credential selection (no auth profile)
    if (!args.authProfileId) {
        const res = await (0, db_1.query)(`SELECT id, api_key_encrypted, endpoint_url, organization_id
       FROM provider_api_credentials
       WHERE tenant_id = $1 AND provider_id = $2 AND is_active = TRUE
       ORDER BY is_default DESC, created_at DESC
       LIMIT 1`, [tenantId, args.providerId]);
        if (res.rows.length === 0)
            throw new Error("NO_ACTIVE_CREDENTIAL");
        const row = res.rows[0];
        const apiKey = (0, cryptoService_1.decryptApiKey)(String(row.api_key_encrypted || ""));
        return {
            credentialId: String(row.id),
            apiKey,
            accessToken: null,
            endpointUrl: row.endpoint_url || null,
            organizationId: row.organization_id || null,
            configVars: {},
        };
    }
    const profile = await loadAuthProfileById({ tenantId, authProfileId: args.authProfileId });
    if (!profile)
        throw new Error("AUTH_PROFILE_NOT_FOUND_OR_INACTIVE");
    if (profile.provider_id !== args.providerId)
        throw new Error("AUTH_PROFILE_PROVIDER_MISMATCH");
    const cred = await loadCredentialById({ tenantId, credentialId: profile.credential_id });
    // expose profile.config primitive values as {{config_<key>}}
    const configVars = {};
    for (const [k, v] of Object.entries(profile.config || {})) {
        if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean")
            continue;
        const safeKey = String(k).replace(/[^a-zA-Z0-9_]/g, "_");
        if (!safeKey)
            continue;
        configVars[`config_${safeKey}`] = String(v);
    }
    if (profile.auth_type === "api_key") {
        return {
            credentialId: cred.id,
            apiKey: cred.secretRaw,
            accessToken: null,
            endpointUrl: cred.endpointUrl,
            organizationId: cred.organizationId,
            configVars,
        };
    }
    if (profile.auth_type === "oauth2_service_account") {
        // credential secret is expected to be a service account JSON (stringified JSON)
        let sa = {};
        try {
            const parsed = JSON.parse(cred.secretRaw);
            sa = safeObj(parsed);
        }
        catch {
            throw new Error("SERVICE_ACCOUNT_JSON_INVALID");
        }
        const tokenUrl = asString(profile.config.token_url) || "https://oauth2.googleapis.com/token";
        const scopes = asStringArray(profile.config.scopes);
        const audience = asString(profile.config.audience) || tokenUrl;
        const cacheKey = profile.token_cache_key || `auth:${tenantId}:${profile.id}`;
        const cached = accessTokenCache.get(cacheKey);
        const now = Date.now();
        if (cached && cached.expiresAtMs - 30000 > now) {
            return {
                credentialId: cred.id,
                apiKey: cred.secretRaw,
                accessToken: cached.accessToken,
                endpointUrl: cred.endpointUrl,
                organizationId: cred.organizationId,
                configVars,
            };
        }
        const t = await fetchGoogleAccessTokenFromServiceAccount({ saJson: sa, scopes, tokenUrl, audience });
        const expiresAtMs = now + Math.max(60, t.expiresInSec) * 1000;
        accessTokenCache.set(cacheKey, { accessToken: t.accessToken, expiresAtMs });
        return {
            credentialId: cred.id,
            apiKey: cred.secretRaw,
            accessToken: t.accessToken,
            endpointUrl: cred.endpointUrl,
            organizationId: cred.organizationId,
            configVars,
        };
    }
    throw new Error(`AUTH_TYPE_NOT_IMPLEMENTED:${profile.auth_type}`);
}
