"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderAuth = getProviderAuth;
exports.getProviderBase = getProviderBase;
exports.openaiListModels = openaiListModels;
exports.anthropicListModels = anthropicListModels;
exports.googleSimulateChat = googleSimulateChat;
exports.openaiSimulateChat = openaiSimulateChat;
exports.anthropicSimulateChat = anthropicSimulateChat;
const db_1 = require("../config/db");
const systemTenantService_1 = require("./systemTenantService");
const cryptoService_1 = require("./cryptoService");
function openAiBlockJsonSchema() {
    // LLM block response schema (server-level enforcement)
    return {
        name: "llm_block_response",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "blocks"],
            properties: {
                title: { type: "string" },
                summary: { type: "string" },
                blocks: {
                    type: "array",
                    items: {
                        oneOf: [
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["type", "markdown"],
                                properties: { type: { const: "markdown" }, markdown: { type: "string" } },
                            },
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["type", "language", "code"],
                                properties: {
                                    type: { const: "code" },
                                    language: { type: "string" },
                                    code: { type: "string" },
                                },
                            },
                            {
                                type: "object",
                                additionalProperties: false,
                                required: ["type", "headers", "rows"],
                                properties: {
                                    type: { const: "table" },
                                    headers: { type: "array", items: { type: "string" } },
                                    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                                },
                            },
                        ],
                    },
                },
            },
        },
    };
}
// OpenAI base URL은 Admin에서 잘못 입력될 수 있어 방어적으로 정규화합니다.
// 예) https://api.openai.com/v1/chat/completions → https://api.openai.com/v1
function normalizeOpenAiBaseUrl(input) {
    const cleaned = (input || "")
        .trim()
        // 가끔 복사/붙여넣기 과정에서 들어오는 zero-width space 제거
        .replace(/\u200b/g, "")
        .replace(/\/+$/g, "");
    if (!cleaned)
        return "";
    // 사용자가 "엔드포인트 전체"를 넣는 경우가 많아 base(v1)로 정규화합니다.
    // - https://api.openai.com            -> https://api.openai.com/v1
    // - https://api.openai.com/v1/        -> https://api.openai.com/v1
    // - https://api.openai.com/v1/responses -> https://api.openai.com/v1
    // - https://api.openai.com/v1/chat/completions -> https://api.openai.com/v1
    // - https://api.openai.com/chat/completions -> https://api.openai.com/v1 (방어)
    try {
        const u = new URL(cleaned);
        // known endpoint suffix trim
        u.pathname = u.pathname
            .replace(/\/v1\/chat\/completions$/i, "/v1")
            .replace(/\/v1\/responses$/i, "/v1")
            .replace(/\/chat\/completions$/i, "")
            .replace(/\/responses$/i, "");
        // ensure /v1 for official OpenAI host
        if (u.host.toLowerCase() === "api.openai.com") {
            if (!u.pathname || u.pathname === "/" || !u.pathname.toLowerCase().startsWith("/v1")) {
                u.pathname = "/v1";
            }
            else if (u.pathname.toLowerCase() !== "/v1") {
                // keep only the base prefix for safety
                u.pathname = "/v1";
            }
        }
        // drop any query/hash user might have pasted
        u.search = "";
        u.hash = "";
        return u.toString().replace(/\/+$/g, "");
    }
    catch {
        // non-standard URL: keep best-effort trimming only
        if (cleaned.endsWith("/chat/completions"))
            return cleaned.replace(/\/chat\/completions$/, "");
        return cleaned;
    }
}
// Google Gemini base URL 정규화
// - 기본: https://generativelanguage.googleapis.com/v1beta
// - 사용자가 /models/...:generateContent 같은 전체 엔드포인트를 넣어도 base까지만 잘라냅니다.
function normalizeGoogleBaseUrl(input) {
    const cleaned = (input || "").trim().replace(/\u200b/g, "").replace(/\/+$/g, "");
    if (!cleaned)
        return "";
    try {
        const u = new URL(cleaned);
        u.pathname = u.pathname
            .replace(/\/v1beta\/models\/.*$/i, "/v1beta")
            .replace(/\/v1\/models\/.*$/i, "/v1")
            .replace(/\/models\/.*$/i, "");
        u.search = "";
        u.hash = "";
        return u.toString().replace(/\/+$/g, "");
    }
    catch {
        return cleaned;
    }
}
async function getProviderAuth(providerId) {
    // 공용 credential(system tenant) 중 default 우선으로 선택
    const systemTenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
    const res = await (0, db_1.query)(`SELECT id, api_key_encrypted, endpoint_url, organization_id
     FROM provider_api_credentials
     WHERE tenant_id = $1 AND provider_id = $2 AND is_active = TRUE
     ORDER BY is_default DESC, created_at DESC
     LIMIT 1`, [systemTenantId, providerId]);
    if (res.rows.length === 0)
        throw new Error("NO_ACTIVE_CREDENTIAL");
    const row = res.rows[0];
    const apiKey = (0, cryptoService_1.decryptApiKey)(row.api_key_encrypted);
    return {
        credentialId: row.id,
        apiKey,
        endpointUrl: row.endpoint_url,
        organizationId: row.organization_id,
    };
}
async function getProviderBase(providerId) {
    const res = await (0, db_1.query)(`SELECT api_base_url, slug FROM ai_providers WHERE id = $1`, [providerId]);
    if (res.rows.length === 0)
        throw new Error("PROVIDER_NOT_FOUND");
    return {
        apiBaseUrl: res.rows[0].api_base_url || "",
        slug: res.rows[0].slug || "",
    };
}
async function openaiListModels(apiBaseUrl, apiKey) {
    const normalized = normalizeOpenAiBaseUrl(apiBaseUrl);
    const base = normalized || "https://api.openai.com/v1";
    const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok)
        throw new Error(`OPENAI_LIST_FAILED_${res.status}`);
    const json = await res.json();
    return (json?.data || []);
}
async function anthropicListModels(apiKey) {
    // Anthropic는 별도 base url을 쓸 수 있지만, 우선 공식 엔드포인트를 사용
    const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
    });
    if (!res.ok)
        throw new Error(`ANTHROPIC_LIST_FAILED_${res.status}`);
    const json = await res.json();
    return (json?.data || []);
}
async function googleSimulateChat(args) {
    const normalized = normalizeGoogleBaseUrl(args.apiBaseUrl);
    const base = normalized || "https://generativelanguage.googleapis.com/v1beta";
    const apiRoot = base.replace(/\/$/, "");
    const url = `${apiRoot}/models/${encodeURIComponent(args.model)}:generateContent`;
    const body = {
        contents: [
            {
                role: "user",
                parts: [{ text: args.input }],
            },
        ],
        generationConfig: {
            maxOutputTokens: args.maxTokens,
        },
    };
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            // Gemini API: either query param key=... or this header
            "x-goog-api-key": args.apiKey,
        },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`GOOGLE_SIMULATE_FAILED_${res.status}@${apiRoot}:${JSON.stringify(json)}`);
    }
    // candidates[0].content.parts[].text
    const parts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) && parts.length
        ? parts
            .map((p) => (typeof p?.text === "string" ? p.text : ""))
            .filter(Boolean)
            .join("")
        : "";
    return { raw: json, output_text: text };
}
async function openaiSimulateChat(args) {
    const normalized = normalizeOpenAiBaseUrl(args.apiBaseUrl);
    const base = normalized || "https://api.openai.com/v1";
    const apiRoot = base.replace(/\/$/, "");
    // OpenAI 모델별로 파라미터/엔드포인트 호환성이 달라질 수 있어 방어적으로 처리합니다.
    // - 일부 최신 모델(GPT-5 계열)은 chat/completions에서 max_tokens를 거부하고 max_completion_tokens를 요구합니다.
    // - 일부 모델은 chat 모델이 아니어서 /v1/chat/completions 자체를 거부할 수 있습니다 → /v1/responses로 fallback.
    async function postJson(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${args.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        return { res, json };
    }
    function extractTextFromChatCompletions(json) {
        return json?.choices?.[0]?.message?.content ?? "";
    }
    function extractTextFromResponses(json) {
        // responses API는 포맷이 환경/버전에 따라 달라질 수 있어 여러 케이스를 흡수합니다.
        if (typeof json?.output_text === "string")
            return json.output_text;
        const output = Array.isArray(json?.output) ? json.output : [];
        for (const item of output) {
            const content = Array.isArray(item?.content) ? item.content : [];
            for (const c of content) {
                if (typeof c?.text === "string")
                    return c.text;
                if (typeof c?.output_text === "string")
                    return c.output_text;
            }
        }
        return "";
    }
    function deepMerge(a, b) {
        // b wins. arrays are replaced.
        if (Array.isArray(a) || Array.isArray(b))
            return b ?? a;
        if (!a || typeof a !== "object")
            return b;
        if (!b || typeof b !== "object")
            return b;
        const out = { ...a };
        for (const [k, v] of Object.entries(b)) {
            const av = out[k];
            out[k] = deepMerge(av, v);
        }
        return out;
    }
    function responsesBody() {
        const schema = args.responseSchema || (args.outputFormat === "block_json" ? openAiBlockJsonSchema() : null);
        const baseBody = {
            model: args.model,
            input: args.input,
            // responses API에서는 max_output_tokens 사용
            max_output_tokens: args.maxTokens,
            // GPT-5 계열은 reasoning 토큰을 과도하게 소모할 수 있어 기본 effort를 낮춥니다.
            reasoning: { effort: "low" },
            // 서버 레벨 JSON 강제 (가능한 경우)
            ...(schema
                ? {
                    // 기본: json_schema (가능한 모델/계정에서 가장 강력한 강제)
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: schema.name,
                            schema: schema.schema,
                            strict: schema.strict !== false,
                        },
                    },
                    text: {
                        format: {
                            type: "json_schema",
                            name: schema.name,
                            schema: schema.schema,
                            strict: schema.strict !== false,
                        },
                    },
                }
                : {
                    // 텍스트 출력 우선
                    text: { verbosity: "low" },
                }),
        };
        // templateBody(JSONB)를 base body에 merge (runtime/base wins)
        return args.templateBody && typeof args.templateBody === "object" ? deepMerge(args.templateBody, baseBody) : baseBody;
    }
    function responsesBodyJsonObject() {
        // json_schema가 미지원일 때의 차선책: JSON object만 강제 (형식/필드 규칙은 프롬프트로)
        return {
            model: args.model,
            input: args.input,
            max_output_tokens: args.maxTokens,
            reasoning: { effort: "low" },
            response_format: { type: "json_object" },
            text: { verbosity: "low" },
        };
    }
    function responsesBodyPlain() {
        // 최후의 차선책: 포맷 파라미터 없이 responses를 호출 (프롬프트로 JSON-only 유도)
        return {
            model: args.model,
            input: args.input,
            max_output_tokens: args.maxTokens,
            reasoning: { effort: "low" },
            text: { verbosity: "low" },
        };
    }
    async function tryResponsesWithNonEmptyText(bodies) {
        for (const body of bodies) {
            const r = await postJson(`${apiRoot}/responses`, body);
            if (!r.res.ok)
                continue;
            const text = extractTextFromResponses(r.json);
            const truncated = r.json?.incomplete_details?.reason === "max_output_tokens";
            // 토큰 제한으로 잘린 경우: 1회 더 큰 토큰으로 재시도해서 "완성본"을 우선 반환
            if (truncated) {
                const bigger = Math.min(Math.max(args.maxTokens, 2048), 4096);
                const retry = await postJson(`${apiRoot}/responses`, { ...body, max_output_tokens: bigger });
                if (retry.res.ok) {
                    const t2 = extractTextFromResponses(retry.json);
                    if (t2 && t2.length >= (text || "").length) {
                        return { ok: true, raw: retry.json, output_text: t2 };
                    }
                }
            }
            if (text)
                return { ok: true, raw: r.json, output_text: text };
        }
        return { ok: false };
    }
    // outputFormat이 있는 경우: 서버 레벨 강제를 위해 responses API를 우선 사용합니다.
    if (args.outputFormat === "block_json") {
        const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()]);
        if (tried.ok)
            return { raw: tried.raw, output_text: tried.output_text };
        // responses가 미지원/차단이면 chat/completions로 fallback (프롬프트 기반 + json_object)
    }
    // GPT-5 계열은 환경에 따라 chat/completions에서 content가 비어있는 경우가 있어
    // responses API를 우선 사용합니다. (실패 시 chat/completions로 fallback)
    const preferResponses = /^gpt-5/i.test((args.model || "").trim());
    if (preferResponses) {
        const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()]);
        if (tried.ok)
            return { raw: tried.raw, output_text: tried.output_text };
        // responses가 막혀있거나 미지원이면 chat/completions로 fallback
    }
    // 1) 우선 chat/completions 시도 (max_completion_tokens 우선)
    {
        const schema = args.outputFormat === "block_json" ? openAiBlockJsonSchema() : null;
        const { res, json } = await postJson(`${apiRoot}/chat/completions`, {
            model: args.model,
            messages: [{ role: "user", content: args.input }],
            // 최신 모델은 max_tokens 대신 max_completion_tokens를 요구할 수 있음
            max_completion_tokens: args.maxTokens,
            ...(schema
                ? {
                    response_format: {
                        // chat/completions 호환성: json_schema가 미지원인 경우가 있어 json_object를 사용합니다.
                        // 스키마 강제는 responses에서 수행하고, 여기서는 "유효한 JSON" 강제 용도로 사용합니다.
                        type: "json_object",
                    },
                }
                : {}),
        });
        if (res.ok) {
            const text = extractTextFromChatCompletions(json);
            // 일부 모델은 chat/completions에서 content가 비어있을 수 있어 responses로 1회 fallback
            if (!text) {
                const tried = await tryResponsesWithNonEmptyText([responsesBody(), responsesBodyJsonObject(), responsesBodyPlain()]);
                if (tried.ok)
                    return { raw: tried.raw, output_text: tried.output_text };
            }
            return { raw: json, output_text: text };
        }
        const errMsg = JSON.stringify(json || {});
        const isUnsupportedResponseFormat = res.status === 400 && /(response_format|json_schema|Invalid schema|unsupported)/i.test(errMsg);
        const isNotChatModel = res.status === 404 &&
            /not a chat model|not supported in the v1\/chat\/completions/i.test(errMsg);
        const isUnsupportedMaxCompletion = res.status === 400 && /max_completion_tokens/i.test(errMsg) && /unsupported|unknown/i.test(errMsg);
        // (구형 모델 대비) max_completion_tokens가 거부되면 max_tokens로 1회 재시도
        if (isUnsupportedMaxCompletion) {
            const retry = await postJson(`${apiRoot}/chat/completions`, {
                model: args.model,
                messages: [{ role: "user", content: args.input }],
                max_tokens: args.maxTokens,
                ...(schema ? { response_format: { type: "json_object" } } : {}),
            });
            if (retry.res.ok) {
                return { raw: retry.json, output_text: extractTextFromChatCompletions(retry.json) };
            }
            throw new Error(`OPENAI_SIMULATE_FAILED_${retry.res.status}@${apiRoot}:${JSON.stringify(retry.json)}`);
        }
        // chat 모델이 아니라면 responses API로 fallback
        if (isNotChatModel) {
            const r2 = await postJson(`${apiRoot}/responses`, responsesBody());
            if (!r2.res.ok)
                throw new Error(`OPENAI_SIMULATE_FAILED_${r2.res.status}@${apiRoot}:${JSON.stringify(r2.json)}`);
            return { raw: r2.json, output_text: extractTextFromResponses(r2.json) };
        }
        // response_format 자체가 모델/계정에서 미지원이면: response_format 제거하고 재시도(프롬프트 기반 fallback)
        if (schema && isUnsupportedResponseFormat) {
            const retry = await postJson(`${apiRoot}/chat/completions`, {
                model: args.model,
                messages: [{ role: "user", content: args.input }],
                max_completion_tokens: args.maxTokens,
            });
            if (retry.res.ok)
                return { raw: retry.json, output_text: extractTextFromChatCompletions(retry.json) };
            throw new Error(`OPENAI_SIMULATE_FAILED_${retry.res.status}@${apiRoot}:${JSON.stringify(retry.json)}`);
        }
        // max_tokens 거부(특히 GPT-5) 등은 responses로 재시도하는 편이 안전합니다.
        const isUnsupportedMaxTokens = res.status === 400 && /max_tokens/i.test(errMsg) && /Use 'max_completion_tokens' instead/i.test(errMsg);
        if (isUnsupportedMaxTokens) {
            // 동일 엔드포인트 재시도: max_completion_tokens만으로 다시 호출
            const retry = await postJson(`${apiRoot}/chat/completions`, {
                model: args.model,
                messages: [{ role: "user", content: args.input }],
                max_completion_tokens: args.maxTokens,
            });
            if (retry.res.ok) {
                return { raw: retry.json, output_text: extractTextFromChatCompletions(retry.json) };
            }
            // 그래도 실패하면 responses로 fallback
            const r2 = await postJson(`${apiRoot}/responses`, responsesBody());
            if (!r2.res.ok)
                throw new Error(`OPENAI_SIMULATE_FAILED_${r2.res.status}@${apiRoot}:${JSON.stringify(r2.json)}`);
            return { raw: r2.json, output_text: extractTextFromResponses(r2.json) };
        }
        throw new Error(`OPENAI_SIMULATE_FAILED_${res.status}@${apiRoot}:${JSON.stringify(json)}`);
    }
}
async function anthropicSimulateChat(args) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": args.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: args.model,
            max_tokens: args.maxTokens,
            messages: [{ role: "user", content: args.input }],
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`ANTHROPIC_SIMULATE_FAILED_${res.status}:${JSON.stringify(json)}`);
    }
    const text = json?.content?.[0]?.text ?? "";
    return { raw: json, output_text: text };
}
