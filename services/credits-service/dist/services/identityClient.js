"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupUsers = lookupUsers;
exports.lookupTenants = lookupTenants;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3002";
const TENANT_SERVICE_URL = process.env.TENANT_SERVICE_URL || "http://localhost:3003";
async function postLookup(url, ids, authHeader) {
    if (ids.length === 0)
        return [];
    try {
        const headers = { "Content-Type": "application/json" };
        if (authHeader)
            headers.Authorization = authHeader;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ ids }),
        });
        if (!res.ok) {
            const errorText = await res.text().catch(() => "");
            console.warn(`lookup failed: ${url} ${res.status} ${errorText}`);
            return [];
        }
        const json = (await res.json().catch(() => ({})));
        return Array.isArray(json.rows) ? json.rows : [];
    }
    catch (e) {
        console.warn(`lookup error: ${url}`, e);
        return [];
    }
}
async function lookupUsers(ids, authHeader) {
    const rows = await postLookup(`${USER_SERVICE_URL}/api/users/lookup`, ids, authHeader);
    const map = new Map();
    for (const row of rows) {
        if (row?.id)
            map.set(String(row.id), row);
    }
    return map;
}
async function lookupTenants(ids, authHeader) {
    const rows = await postLookup(`${TENANT_SERVICE_URL}/api/tenants/lookup`, ids, authHeader);
    const map = new Map();
    for (const row of rows) {
        if (row?.id)
            map.set(String(row.id), row);
    }
    return map;
}
