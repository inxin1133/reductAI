"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationContext = getConversationContext;
exports.chatRun = chatRun;
const db_1 = require("../config/db");
const systemTenantService_1 = require("../services/systemTenantService");
const providerClients_1 = require("../services/providerClients");
const MODEL_TYPES = ["text", "image", "audio", "music", "video", "multimodal", "embedding", "code"];
function isUuid(v) {
    if (typeof v !== "string")
        return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function extractTextFromJsonContent(content) {
    if (typeof content === "string")
        return content;
    if (!content || typeof content !== "object")
        return "";
    const c = content;
    if (typeof c.text === "string")
        return c.text;
    if (typeof c.output_text === "string")
        return c.output_text;
    if (typeof c.input === "string")
        return c.input;
    return "";
}
function detectLanguageCode(text) {
    const s = String(text || "");
    // very small heuristic detector (no external deps)
    if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s))
        return "ko";
    if (/[ぁ-ゔァ-ヴー々〆〤]/.test(s))
        return "ja";
    if (/[\u4e00-\u9fff]/.test(s))
        return "zh";
    if (/[a-zA-Z]/.test(s))
        return "en";
    return null;
}
function extractRequestedLanguage(text) {
    const s = String(text || "").toLowerCase();
    // minimal patterns; can be extended
    if (s.includes("한국어로") || s.includes("korean"))
        return "ko";
    if (s.includes("영어로") || s.includes("english"))
        return "en";
    if (s.includes("일본어로") || s.includes("japanese"))
        return "ja";
    if (s.includes("중국어로") || s.includes("chinese"))
        return "zh";
    return null;
}
function clampInt(n, min, max) {
    if (!Number.isFinite(n))
        return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}
function deepInjectVars(input, vars) {
    if (typeof input === "string") {
        return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => (k in vars ? vars[k] : ""));
    }
    if (Array.isArray(input))
        return input.map((v) => deepInjectVars(v, vars));
    if (input && typeof input === "object") {
        const out = {};
        for (const [k, v] of Object.entries(input))
            out[k] = deepInjectVars(v, vars);
        return out;
    }
    return input;
}
function matchCondition(cond, ctx) {
    if (!cond || typeof cond !== "object" || Array.isArray(cond))
        return false;
    const c = cond;
    for (const [k, v] of Object.entries(c)) {
        const cv = ctx[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const op = v;
            const num = Number(cv);
            if ("$lte" in op && !(num <= Number(op.$lte)))
                return false;
            if ("$lt" in op && !(num < Number(op.$lt)))
                return false;
            if ("$gte" in op && !(num >= Number(op.$gte)))
                return false;
            if ("$gt" in op && !(num > Number(op.$gt)))
                return false;
            continue;
        }
        if (typeof v === "string") {
            if (String(cv || "") !== v)
                return false;
            continue;
        }
        if (typeof v === "number") {
            if (Number(cv) !== v)
                return false;
            continue;
        }
        if (typeof v === "boolean") {
            if (Boolean(cv) !== v)
                return false;
            continue;
        }
        // unknown types: ignore (non-blocking)
    }
    return true;
}
async function pickModelByRouting(args) {
    // scope: GLOBAL + TENANT only (ROLE scope needs role_id context; can be added later)
    const rules = await (0, db_1.query)(`
    SELECT id, priority, conditions, target_model_id, fallback_model_id
    FROM model_routing_rules
    WHERE tenant_id = $1
      AND is_active = TRUE
      AND (
        (scope_type = 'GLOBAL' AND scope_id IS NULL)
        OR (scope_type = 'TENANT' AND scope_id = $1)
      )
    ORDER BY priority DESC, updated_at DESC
    `, [args.tenantId]);
    const ctx = {
        feature: "chat",
        model_type: args.modelType,
        language: args.language,
        max_tokens: args.maxTokens,
    };
    for (const r of rules.rows) {
        const cond = (r.conditions && typeof r.conditions === "object" && !Array.isArray(r.conditions)) ? r.conditions : {};
        // default feature=chat if absent
        if (!("feature" in cond))
            cond.feature = "chat";
        if (!matchCondition(cond, ctx))
            continue;
        // pick target if available else fallback if available
        const target = await (0, db_1.query)(`SELECT id FROM ai_models WHERE id = $1 AND status = 'active' AND is_available = TRUE LIMIT 1`, [r.target_model_id]);
        if (target.rows.length > 0)
            return r.target_model_id;
        if (r.fallback_model_id) {
            const fb = await (0, db_1.query)(`SELECT id FROM ai_models WHERE id = $1 AND status = 'active' AND is_available = TRUE LIMIT 1`, [r.fallback_model_id]);
            if (fb.rows.length > 0)
                return r.fallback_model_id;
        }
    }
    return null;
}
async function pickDefaultModel(modelType) {
    const r = await (0, db_1.query)(`
    SELECT id
    FROM ai_models
    WHERE model_type = $1
      AND status = 'active'
      AND is_available = TRUE
    ORDER BY is_default DESC, sort_order ASC, created_at DESC
    LIMIT 1
    `, [modelType]);
    return r.rows[0]?.id ? String(r.rows[0].id) : null;
}
async function ensureConversationOwned(args) {
    const r = await (0, db_1.query)(`SELECT id FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active' LIMIT 1`, [args.conversationId, args.tenantId, args.userId]);
    return r.rows.length > 0;
}
async function createConversation(args) {
    const title = (String(args.firstMessage || "").split("\n")[0] || "새 대화").trim().slice(0, 15) || "새 대화";
    const r = await (0, db_1.query)(`INSERT INTO model_conversations (tenant_id, user_id, model_id, title, status)
     VALUES ($1, $2::uuid, $3, $4, 'active')
     RETURNING id`, [args.tenantId, args.userId, args.modelDbId, title]);
    return String(r.rows[0].id);
}
async function appendMessage(args) {
    const maxOrder = await (0, db_1.query)(`SELECT COALESCE(MAX(message_order), 0)::int AS max FROM model_messages WHERE conversation_id = $1`, [
        args.conversationId,
    ]);
    const nextOrder = Number(maxOrder.rows[0]?.max || 0) + 1;
    const r = await (0, db_1.query)(`
    INSERT INTO model_messages (conversation_id, role, content, content_text, summary, message_order, metadata)
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb)
    RETURNING id, message_order
    `, [
        args.conversationId,
        args.role,
        JSON.stringify(args.content),
        args.contentText || null,
        args.summary,
        nextOrder,
        JSON.stringify({ model: args.modelApiId }),
    ]);
    return { id: String(r.rows[0].id), message_order: Number(r.rows[0].message_order) };
}
async function loadHistory(args) {
    const conv = await (0, db_1.query)(`SELECT conversation_summary, conversation_summary_updated_at, conversation_summary_tokens
     FROM model_conversations WHERE id = $1 LIMIT 1`, [args.conversationId]);
    const conversationSummary = conv.rows[0]?.conversation_summary ? String(conv.rows[0].conversation_summary) : "";
    // short term: last 16 messages (row 기준)
    const short = await (0, db_1.query)(`SELECT role, content, content_text
     FROM model_messages
     WHERE conversation_id = $1
     ORDER BY message_order DESC
     LIMIT 16`, [args.conversationId]);
    const shortRows = (short.rows || []).slice().reverse();
    const shortText = shortRows
        .map((m) => {
        const role = String(m.role || "");
        const t = (typeof m.content_text === "string" && m.content_text.trim()) ? String(m.content_text) : extractTextFromJsonContent(m.content);
        return `${role}: ${t}`;
    })
        .join("\n");
    // long term: use summaries (cheap)
    const sums = await (0, db_1.query)(`SELECT role, summary
     FROM model_messages
     WHERE conversation_id = $1
       AND summary IS NOT NULL
       AND summary <> ''
     ORDER BY message_order ASC`, [args.conversationId]);
    const longText = sums.rows
        .slice(-80) // cap
        .map((m) => `${String(m.role || "")}: ${String(m.summary || "")}`)
        .join("\n");
    return { conversationSummary, shortText, longText };
}
async function getConversationContext(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const conversationId = String(req.params?.id || "").trim();
        if (!isUuid(conversationId))
            return res.status(400).json({ message: "Invalid conversation id" });
        const ok = await ensureConversationOwned({ tenantId, userId, conversationId });
        if (!ok)
            return res.status(404).json({ message: "Conversation not found" });
        // short term: message rows (for UI)
        const short = await (0, db_1.query)(`SELECT id, role, content, content_text, summary, message_order, created_at
       FROM model_messages
       WHERE conversation_id = $1
       ORDER BY message_order DESC
       LIMIT 16`, [conversationId]);
        const shortRows = (short.rows || []).slice().reverse().map((m) => {
            const text = (typeof m.content_text === "string" && m.content_text.trim()) ? String(m.content_text) : extractTextFromJsonContent(m.content);
            return {
                id: String(m.id),
                role: String(m.role || ""),
                message_order: Number(m.message_order || 0),
                created_at: m.created_at,
                content_text: text,
                content: m.content,
                summary: typeof m.summary === "string" ? m.summary : null,
            };
        });
        // long term: conversation_summary + message summaries
        const conv = await (0, db_1.query)(`SELECT conversation_summary, conversation_summary_updated_at, conversation_summary_tokens
       FROM model_conversations
       WHERE id = $1
       LIMIT 1`, [conversationId]);
        const sums = await (0, db_1.query)(`SELECT id, role, summary, summary_tokens, importance, is_pinned, segment_group, message_order, updated_at, created_at
       FROM model_messages
       WHERE conversation_id = $1
         AND summary IS NOT NULL
         AND summary <> ''
       ORDER BY message_order ASC
       LIMIT 200`, [conversationId]);
        const summaryRows = (sums.rows || []).slice(-80).map((m) => ({
            id: String(m.id),
            role: String(m.role || ""),
            message_order: Number(m.message_order || 0),
            summary: String(m.summary || ""),
            summary_tokens: Number(m.summary_tokens || 0),
            importance: Number(m.importance || 0),
            is_pinned: Boolean(m.is_pinned),
            segment_group: typeof m.segment_group === "string" ? m.segment_group : null,
            updated_at: m.updated_at,
            created_at: m.created_at,
        }));
        // also provide the exact text context used by runtime, for debugging
        const runtime = await loadHistory({ conversationId });
        return res.json({
            ok: true,
            conversation_id: conversationId,
            content_context: {
                limit: 16,
                rows: shortRows,
            },
            summary_context: {
                conversation_summary: conv.rows[0]?.conversation_summary ? String(conv.rows[0].conversation_summary) : "",
                conversation_summary_updated_at: conv.rows[0]?.conversation_summary_updated_at ?? null,
                conversation_summary_tokens: Number(conv.rows[0]?.conversation_summary_tokens || 0),
                message_summaries: summaryRows,
            },
            runtime_context: runtime,
        });
    }
    catch (e) {
        console.error("getConversationContext error:", e);
        return res.status(500).json({ message: "Failed to get conversation context", details: String(e?.message || e) });
    }
}
async function chatRun(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const { model_type, conversation_id, userPrompt, max_tokens, session_language, 
        // optional: client-selected model override
        model_api_id, provider_id, provider_slug, options, } = req.body || {};
        const prompt = String(userPrompt || "").trim();
        if (!prompt)
            return res.status(400).json({ message: "userPrompt is required" });
        const mt = String(model_type || "").trim() || "text";
        if (!MODEL_TYPES.includes(mt))
            return res.status(400).json({ message: `Invalid model_type: ${mt}` });
        // 9) language selection priority
        const requestedLang = extractRequestedLanguage(prompt);
        const detectedLang = detectLanguageCode(prompt);
        const sessionLang = typeof session_language === "string" ? session_language.trim() : "";
        // We'll fill history language later if conversation exists.
        let historyLang = null;
        // safe max_tokens
        const maxTokensRequested = clampInt(Number(max_tokens ?? 512) || 512, 16, 8192);
        // 1) routing rule evaluation -> 2) model selection
        let chosenModelDbId = null;
        // if client specifies explicit model_api_id + provider_id, try to resolve that exact model first
        if (model_api_id && provider_id && isUuid(String(provider_id))) {
            const exact = await (0, db_1.query)(`SELECT id FROM ai_models WHERE provider_id = $1 AND model_id = $2 AND status='active' AND is_available=TRUE LIMIT 1`, [String(provider_id), String(model_api_id)]);
            if (exact.rows.length > 0)
                chosenModelDbId = String(exact.rows[0].id);
        }
        // allow client to specify provider_slug instead of provider_id (useful for FrontAI/Timeline)
        if (!chosenModelDbId && model_api_id && provider_slug && String(provider_slug).trim()) {
            const exact = await (0, db_1.query)(`
        SELECT m.id
        FROM ai_models m
        JOIN ai_providers p ON p.id = m.provider_id
        WHERE p.slug = $1
          AND m.model_id = $2
          AND m.status = 'active'
          AND m.is_available = TRUE
        LIMIT 1
        `, [String(provider_slug).trim(), String(model_api_id)]);
            if (exact.rows.length > 0)
                chosenModelDbId = String(exact.rows[0].id);
        }
        const effectiveLang = requestedLang || detectedLang || sessionLang || "ko";
        if (!chosenModelDbId) {
            chosenModelDbId = await pickModelByRouting({ tenantId, modelType: mt, language: effectiveLang, maxTokens: maxTokensRequested });
        }
        if (!chosenModelDbId) {
            chosenModelDbId = await pickDefaultModel(mt);
        }
        if (!chosenModelDbId)
            return res.status(404).json({ message: `No available model for model_type=${mt}` });
        // load chosen model + provider
        const chosen = await (0, db_1.query)(`
      SELECT
        m.id,
        m.model_id AS model_api_id,
        m.max_output_tokens,
        m.prompt_template_id,
        m.response_schema_id,
        m.capabilities,
        p.id AS provider_id,
        p.provider_family,
        p.slug AS provider_slug,
        p.product_name AS provider_product_name,
        p.description AS provider_description
      FROM ai_models m
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE m.id = $1
      LIMIT 1
      `, [chosenModelDbId]);
        if (chosen.rows.length === 0)
            return res.status(404).json({ message: "Chosen model not found" });
        const row = chosen.rows[0];
        // conversation ownership / creation
        let convId = conversation_id ? String(conversation_id) : "";
        if (convId) {
            const ok = await ensureConversationOwned({ tenantId, userId, conversationId: convId });
            if (!ok)
                return res.status(404).json({ message: "Conversation not found" });
        }
        else {
            convId = await createConversation({ tenantId, userId, modelDbId: chosenModelDbId, firstMessage: prompt });
        }
        // history language (3rd priority): last assistant message
        try {
            const lastA = await (0, db_1.query)(`SELECT content_text, content
         FROM model_messages
         WHERE conversation_id = $1 AND role='assistant'
         ORDER BY message_order DESC
         LIMIT 1`, [convId]);
            const lastText = typeof lastA.rows?.[0]?.content_text === "string"
                ? String(lastA.rows[0].content_text)
                : extractTextFromJsonContent(lastA.rows?.[0]?.content);
            historyLang = detectLanguageCode(lastText);
        }
        catch {
            historyLang = null;
        }
        const finalLang = requestedLang || detectedLang || historyLang || sessionLang || "ko";
        // 6) short-term + long-term context
        const history = await loadHistory({ conversationId: convId });
        // 3) template load
        let templateBody = null;
        if (row.prompt_template_id) {
            const t = await (0, db_1.query)(`SELECT body FROM prompt_templates WHERE id = $1 AND is_active = TRUE LIMIT 1`, [String(row.prompt_template_id)]);
            const b = t.rows?.[0]?.body;
            if (b && typeof b === "object" && !Array.isArray(b))
                templateBody = b;
        }
        // 3.5) response schema load (openai only will use it)
        let responseSchema = null;
        if (row.response_schema_id) {
            const r = await (0, db_1.query)(`SELECT name, strict, schema FROM response_schemas WHERE id = $1 AND is_active = TRUE LIMIT 1`, [String(row.response_schema_id)]);
            const s = r.rows?.[0]?.schema;
            if (r.rows?.[0]?.name && s && typeof s === "object" && !Array.isArray(s)) {
                responseSchema = { name: String(r.rows[0].name), strict: Boolean(r.rows[0].strict), schema: s };
            }
        }
        // 4) 변수 주입
        const injectedTemplate = templateBody
            ? deepInjectVars(templateBody, {
                userPrompt: prompt,
                language: finalLang,
                shortHistory: history.shortText,
                longSummary: history.conversationSummary || history.longText,
            })
            : null;
        // 5) 안전 조정 (min/max)
        const modelMaxOut = row.max_output_tokens ? Number(row.max_output_tokens) : null;
        const safeMaxTokens = modelMaxOut ? clampInt(maxTokensRequested, 16, Math.max(16, modelMaxOut)) : maxTokensRequested;
        // 7) 최종 request body 생성 + provider call
        const providerId = String(row.provider_id);
        const auth = await (0, providerClients_1.getProviderAuth)(providerId);
        const base = await (0, providerClients_1.getProviderBase)(providerId);
        const providerKey = String(row.provider_family || row.provider_slug || "").trim().toLowerCase();
        const modelApiId = String(row.model_api_id || "");
        // For now: only text/chat execution is implemented.
        if (mt !== "text") {
            return res.status(400).json({
                message: `Not implemented for model_type=${mt}`,
                details: "Only text/chat is implemented in chatRun currently. Options payload is accepted but not executed yet.",
                conversation_id: convId,
                chosen: {
                    provider_product_name: String(row.provider_product_name || ""),
                    provider_description: String(row.provider_description || ""),
                    provider_key: providerKey,
                    model_api_id: modelApiId,
                },
            });
        }
        // language instruction (server-level)
        const langInstruction = finalLang ? `\n\n(출력 언어: ${finalLang})` : "";
        const input = [
            history.conversationSummary ? `대화 요약:\n${history.conversationSummary}\n` : "",
            history.longText ? `대화 요약(메시지 summary):\n${history.longText}\n` : "",
            history.shortText ? `최근 대화:\n${history.shortText}\n` : "",
            `사용자 요청:\n${prompt}${langInstruction}`,
        ]
            .filter(Boolean)
            .join("\n\n");
        let out;
        if (providerKey === "openai") {
            out = await (0, providerClients_1.openaiSimulateChat)({
                apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
                apiKey: auth.apiKey,
                model: modelApiId,
                input,
                maxTokens: safeMaxTokens,
                templateBody: injectedTemplate || undefined,
                responseSchema,
            });
        }
        else if (providerKey === "anthropic") {
            out = await (0, providerClients_1.anthropicSimulateChat)({
                apiKey: auth.apiKey,
                model: modelApiId,
                input,
                maxTokens: safeMaxTokens,
            });
        }
        else if (providerKey === "google") {
            out = await (0, providerClients_1.googleSimulateChat)({
                apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
                apiKey: auth.apiKey,
                model: modelApiId,
                input,
                maxTokens: safeMaxTokens,
            });
        }
        else {
            return res.status(400).json({ message: `Unsupported provider_family/provider_slug: ${providerKey}` });
        }
        // persist messages (user + assistant)
        await appendMessage({
            conversationId: convId,
            role: "user",
            content: { text: prompt, options: options || {} },
            contentText: prompt,
            summary: null,
            modelApiId,
        });
        await appendMessage({
            conversationId: convId,
            role: "assistant",
            content: { output_text: out.output_text, raw: out.raw },
            contentText: String(out.output_text || ""),
            summary: null,
            modelApiId,
        });
        // best-effort: keep conversation model_id updated to last used model
        await (0, db_1.query)(`UPDATE model_conversations SET model_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [convId, chosenModelDbId]);
        return res.json({
            ok: true,
            conversation_id: convId,
            language: finalLang,
            chosen: {
                provider_id: providerId,
                provider_key: providerKey,
                provider_product_name: String(row.provider_product_name || ""),
                provider_description: String(row.provider_description || ""),
                model_db_id: chosenModelDbId,
                model_api_id: modelApiId,
            },
            output_text: out.output_text,
            raw: out.raw,
        });
    }
    catch (e) {
        console.error("chatRun error:", e);
        return res.status(500).json({ message: "Failed to run chat", details: String(e?.message || e) });
    }
}
