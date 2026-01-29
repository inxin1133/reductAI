"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serperSearch = serperSearch;
function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? Math.trunc(n) : min;
    return Math.min(Math.max(x, min), max);
}
function safeStr(v, maxLen) {
    const s = typeof v === "string" ? v : v == null ? "" : String(v);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}
async function serperSearch(args) {
    const limit = clampInt(Number(args.limit ?? 5) || 5, 1, 10);
    const timeoutMs = clampInt(Number(args.timeoutMs ?? 10000) || 10000, 2000, 30000);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (args.signal) {
        if (args.signal.aborted)
            controller.abort();
        else
            args.signal.addEventListener("abort", onAbort);
    }
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": args.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                q: args.query,
                gl: args.country,
                hl: args.language,
                num: Math.max(limit, 5),
            }),
            signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(`SERPER_HTTP_${res.status}:${JSON.stringify(json)}`);
        }
        const organicRaw = Array.isArray(json?.organic) ? json.organic : [];
        const organic = organicRaw
            .map((it) => ({
            title: safeStr(it.title, 160).trim(),
            link: safeStr(it.link, 500).trim(),
            snippet: safeStr(it.snippet, 400).trim(),
            position: Number(it.position ?? 0) || 0,
        }))
            .filter((x) => x.title && x.link)
            .slice(0, limit);
        return {
            query: String(args.query || ""),
            country: String(args.country || ""),
            language: String(args.language || ""),
            organic,
            raw: json,
        };
    }
    finally {
        clearTimeout(t);
        if (args.signal)
            args.signal.removeEventListener("abort", onAbort);
    }
}
