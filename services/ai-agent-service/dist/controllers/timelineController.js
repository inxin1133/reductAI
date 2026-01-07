"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listThreads = listThreads;
exports.createThread = createThread;
exports.listMessages = listMessages;
exports.getMessageMedia = getMessageMedia;
exports.addMessage = addMessage;
exports.updateThreadTitle = updateThreadTitle;
const db_1 = require("../config/db");
const providerClients_1 = require("../services/providerClients");
const systemTenantService_1 = require("../services/systemTenantService");
function clampText(input, max) {
    const s = String(input || "").replace(/\s+/g, " ").trim();
    if (s.length <= max)
        return s;
    // max 이내를 엄격히 지키기 위해 …를 붙이지 않습니다.
    return s.slice(0, max);
}
function assistantSummaryOneSentence(input) {
    // 규칙:
    // - 핵심 1문장, 100자 이내
    // - 마침표 1개
    const cleaned = String(input || "").replace(/\s+/g, " ").trim();
    const withoutDots = cleaned.replace(/\./g, "");
    const head = clampText(withoutDots, 99); // + "." = 100자 이내 보장
    return head ? `${head}.` : "요약.";
}
function extractTextFromJsonContent(content) {
    if (typeof content === "string")
        return content;
    if (!content || typeof content !== "object")
        return "";
    const c = content;
    // common patterns
    if (typeof c.text === "string")
        return c.text;
    if (typeof c.output_text === "string")
        return c.output_text;
    if (typeof c.input === "string")
        return c.input;
    // ai-agent-service /api/ai/chat 응답 형태
    if (typeof c.output_text === "string")
        return c.output_text;
    return "";
}
function normalizeJsonContent(content) {
    if (content && typeof content === "object")
        return content;
    if (typeof content === "string")
        return { text: content };
    return { value: content };
}
function isRecord(v) {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function parseDataUrlImage(url) {
    const s = String(url || "");
    const m = s.match(/^data:([^;]+);base64,(.*)$/);
    if (!m)
        return null;
    const mime = m[1] || "image/png";
    const base64 = m[2] || "";
    if (!base64)
        return null;
    return { mime, base64 };
}
function isLargeDataUrl(url) {
    // Heuristic: base64 data URLs quickly blow up payloads & markdown rendering.
    // ~200KB threshold keeps Timeline snappy.
    return typeof url === "string" && url.startsWith("data:image/") && url.length > 200000;
}
function deriveSummary(args) {
    const role = args.role;
    if (role === "tool") {
        const name = (args.toolName || "").trim();
        return name ? `도구 호출: ${name}` : "도구 호출: unknown";
    }
    if (role === "assistant")
        return assistantSummaryOneSentence(extractTextFromJsonContent(args.content));
    // user/system
    return clampText(extractTextFromJsonContent(args.content), 50);
}
function normalizeTitle(s) {
    const trimmed = (s || "").replace(/\s+/g, " ").trim();
    if (!trimmed)
        return "새 대화";
    // 너무 길면 잘라서 UI 안정성 확보
    // 요구사항: 15자 이내(한글 기준)
    const max = 15;
    if (trimmed.length <= max)
        return trimmed;
    // 15자 이내를 엄격히 지키기 위해 …를 붙이지 않습니다.
    return trimmed.slice(0, max);
}
function fallbackTitleFromPrompt(input) {
    const firstLine = (input || "").split("\n")[0]?.trim() || "새 대화";
    return normalizeTitle(firstLine);
}
async function generateTitleByOpenAi(firstMessage) {
    // OpenAI credential이 등록되어 있으면, 제목을 더 자연스럽게 생성합니다.
    // - 출력 포맷을 JSON으로 강제하여 파싱 안정성을 높입니다.
    // - 너무 비싼 모델을 쓰지 않기 위해 기본은 gpt-4o-mini를 사용합니다.
    try {
        const provider = await (0, db_1.query)(`SELECT id FROM ai_providers WHERE slug = 'openai' LIMIT 1`);
        if (provider.rows.length === 0)
            throw new Error("OPENAI_PROVIDER_NOT_FOUND");
        const providerId = provider.rows[0].id;
        const auth = await (0, providerClients_1.getProviderAuth)(providerId);
        const base = await (0, providerClients_1.getProviderBase)(providerId);
        const prompt = [
            "다음 사용자 질문을 보고 '대화 타임라인'에 표시할 제목을 만들어줘.",
            "- 한국어로 자연스럽게",
            "- 15자 이내",
            "- 키워드/부연설명 없이 제목만",
            "- 반드시 JSON으로만 출력",
            "",
            "출력 형식:",
            '{"title":"..."}',
            "",
            `사용자 질문: ${firstMessage}`,
        ].join("\n");
        const out = await (0, providerClients_1.openaiSimulateChat)({
            apiBaseUrl: auth.endpointUrl || base.apiBaseUrl,
            apiKey: auth.apiKey,
            model: "gpt-4o-mini",
            input: prompt,
            maxTokens: 120,
        });
        const raw = out.output_text || "";
        const parsed = JSON.parse(raw);
        return normalizeTitle(parsed?.title || "");
    }
    catch (e) {
        console.warn("[Timeline] title generation fallback:", e);
        return fallbackTitleFromPrompt(firstMessage);
    }
}
async function resolveAiModelIdByApiModel(modelApiId) {
    // model_conversations는 ai_models(id)를 필요로 하므로,
    // 프론트에서 넘어오는 model(=API model id)을 ai_models.id로 매핑합니다.
    // 우선순위:
    // 1) OpenAI provider + 정확히 일치하는 model_id
    // 2) OpenAI provider + text + default
    // 3) text + default
    const apiModel = (modelApiId || "").trim();
    if (apiModel) {
        const r = await (0, db_1.query)(`SELECT m.id
       FROM ai_models m
       JOIN ai_providers p ON p.id = m.provider_id
       WHERE p.slug = 'openai' AND m.model_id = $1
       LIMIT 1`, [apiModel]);
        if (r.rows.length > 0)
            return r.rows[0].id;
    }
    const r2 = await (0, db_1.query)(`SELECT m.id
     FROM ai_models m
     JOIN ai_providers p ON p.id = m.provider_id
     WHERE p.slug = 'openai' AND m.model_type = 'text' AND m.status = 'active' AND m.is_available = TRUE
     ORDER BY m.is_default DESC, m.created_at DESC
     LIMIT 1`);
    if (r2.rows.length > 0)
        return r2.rows[0].id;
    const r3 = await (0, db_1.query)(`SELECT id
     FROM ai_models
     WHERE model_type = 'text' AND status = 'active' AND is_available = TRUE
     ORDER BY is_default DESC, created_at DESC
     LIMIT 1`);
    if (r3.rows.length > 0)
        return r3.rows[0].id;
    throw new Error("NO_AVAILABLE_TEXT_MODEL");
}
// 대화 스레드 목록 (최근 업데이트 순)
async function listThreads(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const result = await (0, db_1.query)(`SELECT id, user_id, title, created_at, updated_at
       FROM model_conversations
       WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
       ORDER BY updated_at DESC`, [tenantId, userId]);
        res.json(result.rows);
    }
    catch (e) {
        console.error("listThreads error:", e);
        res.status(500).json({ message: "Failed to fetch threads" });
    }
}
// 스레드 생성
async function createThread(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const { title, first_message, model } = req.body || {};
        // 제목 우선순위:
        // 1) first_message가 있으면 OpenAI로 요약/키워드 제목 생성
        // 2) title이 있으면 그대로 사용
        // 3) 기본값
        const safeTitle = first_message
            ? await generateTitleByOpenAi(String(first_message))
            : normalizeTitle(title || "새 대화");
        const modelId = await resolveAiModelIdByApiModel(model || null);
        const result = await (0, db_1.query)(`INSERT INTO model_conversations (tenant_id, user_id, model_id, title, status)
       VALUES ($1, $2::uuid, $3, $4, 'active')
       RETURNING id, user_id, title, created_at, updated_at`, [tenantId, userId, modelId, safeTitle]);
        res.status(201).json(result.rows[0]);
    }
    catch (e) {
        console.error("createThread error:", e);
        res.status(500).json({ message: "Failed to create thread" });
    }
}
// 스레드 메시지 목록
async function listMessages(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        // 보안: 본인 대화만 조회 가능
        const owns = await (0, db_1.query)(`SELECT 1 FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`, [id, tenantId, userId]);
        if (owns.rows.length === 0)
            return res.status(404).json({ message: "Thread not found" });
        // Resolve provider logo key for each message.
        // - preferred: metadata.provider_logo_key (stored at write-time by chat runtime)
        // - fallback: metadata.provider_slug -> ai_providers.slug
        // - fallback2: metadata.provider_key (aka provider_family) -> ai_providers.provider_family
        const result = await (0, db_1.query)(`
      SELECT
        mm.id,
        mm.conversation_id,
        mm.role,
        mm.content,
        mm.summary,
        mm.metadata,
        mm.message_order,
        mm.created_at,
        COALESCE(NULLIF(mm.metadata->>'provider_logo_key',''), p_slug.logo_key, p_family.logo_key) AS provider_logo_key,
        COALESCE(p_slug.slug, p_family.slug) AS provider_slug_resolved
      FROM model_messages mm
      LEFT JOIN ai_providers p_slug
        ON p_slug.slug = NULLIF(mm.metadata->>'provider_slug', '')
      LEFT JOIN ai_providers p_family
        ON lower(p_family.provider_family) = lower(NULLIF(mm.metadata->>'provider_key', ''))
      WHERE mm.conversation_id = $1
      ORDER BY mm.message_order ASC
      `, [id]);
        // Performance: if assistant content contains huge data:image URLs, replace them with a lightweight proxy URL.
        // This prevents Timeline from downloading/rendering massive JSON on initial page load.
        const rows = (result.rows || []).map((row) => {
            const content = row?.content;
            if (!isRecord(content))
                return row;
            const imagesRaw = Array.isArray(content.images) ? content.images : null;
            if (!imagesRaw || imagesRaw.length === 0)
                return row;
            let changed = false;
            const newImages = imagesRaw.map((it, idx) => {
                const rec = isRecord(it) ? it : null;
                const url = rec && typeof rec.url === "string" ? rec.url : "";
                if (url && isLargeDataUrl(url)) {
                    changed = true;
                    return { ...(rec || {}), url: `/api/ai/timeline/threads/${row.conversation_id}/messages/${row.id}/media/image/${idx}` };
                }
                return it;
            });
            if (!changed)
                return row;
            const nextContent = { ...content, images: newImages, _media_proxied: true };
            return { ...row, content: nextContent };
        });
        res.json(rows);
    }
    catch (e) {
        console.error("listMessages error:", e);
        res.status(500).json({ message: "Failed to fetch messages" });
    }
}
// 메시지에 포함된 base64(data URL) 미디어를 proxy로 제공합니다. (현재는 image만)
async function getMessageMedia(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const { id, messageId, kind, index } = (req.params || {});
        // allow both route param names (threadId=id, messageId=messageId)
        const threadId = String(id || "").trim();
        const mid = String(messageId || "").trim();
        const k = String(kind || "").trim().toLowerCase();
        const idx = Number(index || 0);
        if (!threadId || !mid)
            return res.status(400).json({ message: "Invalid params" });
        if (k !== "image")
            return res.status(400).json({ message: "Unsupported media kind" });
        if (!Number.isFinite(idx) || idx < 0)
            return res.status(400).json({ message: "Invalid index" });
        // ownership check
        const owns = await (0, db_1.query)(`SELECT 1 FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`, [threadId, tenantId, userId]);
        if (owns.rows.length === 0)
            return res.status(404).json({ message: "Thread not found" });
        const r = await (0, db_1.query)(`SELECT id, content
       FROM model_messages
       WHERE id = $1 AND conversation_id = $2
       LIMIT 1`, [mid, threadId]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Message not found" });
        const content = r.rows[0]?.content;
        if (!isRecord(content))
            return res.status(404).json({ message: "No media" });
        const imagesRaw = Array.isArray(content.images) ? content.images : [];
        const item = imagesRaw[idx];
        const rec = isRecord(item) ? item : null;
        const url = rec && typeof rec.url === "string" ? rec.url : "";
        const parsed = url ? parseDataUrlImage(url) : null;
        if (!parsed)
            return res.status(404).json({ message: "No media" });
        const buf = Buffer.from(parsed.base64, "base64");
        res.setHeader("Content-Type", parsed.mime);
        res.setHeader("Cache-Control", "private, max-age=3600");
        return res.status(200).send(buf);
    }
    catch (e) {
        console.error("getMessageMedia error:", e);
        return res.status(500).json({ message: "Failed to fetch media" });
    }
}
// 스레드에 메시지 추가 + threads.updated_at 갱신
async function addMessage(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const body = req.body || {};
        const role = body.role;
        const content = body.content;
        const summaryIn = body.summary ?? null;
        const model = body.model ?? null;
        const toolName = body.tool_name ?? null;
        if (!role || content === undefined || content === null) {
            return res.status(400).json({ message: "role and content are required" });
        }
        // 보안: 본인 대화만 수정 가능
        const owns = await (0, db_1.query)(`SELECT 1 FROM model_conversations WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'`, [id, tenantId, userId]);
        if (owns.rows.length === 0)
            return res.status(404).json({ message: "Thread not found" });
        const ord = await (0, db_1.query)(`SELECT COALESCE(MAX(message_order), 0) + 1 AS next_order
       FROM model_messages
       WHERE conversation_id = $1`, [id]);
        const nextOrder = Number(ord.rows?.[0]?.next_order || 1);
        // model_messages는 별도 model 컬럼이 없으므로 metadata에 저장합니다.
        const metadata = { ...(model ? { model } : {}), ...(toolName ? { tool_name: toolName } : {}) };
        const normalizedContent = normalizeJsonContent(content);
        const summary = typeof summaryIn === "string" && summaryIn.trim()
            ? (role === "assistant" ? assistantSummaryOneSentence(summaryIn) : clampText(summaryIn, role === "user" ? 50 : 100))
            : deriveSummary({ role, content: normalizedContent, toolName: toolName || undefined });
        const insert = await (0, db_1.query)(`INSERT INTO model_messages (conversation_id, role, content, summary, message_order, metadata)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb)
       RETURNING id, conversation_id, role, content, summary, metadata, message_order, created_at`, [id, role, JSON.stringify(normalizedContent), summary, nextOrder, JSON.stringify(metadata)]);
        // 최근순 정렬을 위해 updated_at 갱신
        await (0, db_1.query)(`UPDATE model_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        res.status(201).json(insert.rows[0]);
    }
    catch (e) {
        console.error("addMessage error:", e);
        res.status(500).json({ message: "Failed to add message" });
    }
}
// 스레드 제목 수정(선택)
async function updateThreadTitle(req, res) {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const { title } = req.body || {};
        const safeTitle = (title || "").trim();
        if (!safeTitle)
            return res.status(400).json({ message: "title is required" });
        const result = await (0, db_1.query)(`UPDATE model_conversations
       SET title = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'active'
       RETURNING id, user_id, title, created_at, updated_at`, [id, tenantId, userId, safeTitle]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Thread not found" });
        res.json(result.rows[0]);
    }
    catch (e) {
        console.error("updateThreadTitle error:", e);
        res.status(500).json({ message: "Failed to update thread title" });
    }
}
