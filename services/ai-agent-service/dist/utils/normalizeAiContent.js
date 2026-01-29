"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAiContent = normalizeAiContent;
function isRecord(v) {
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function parseJsonLikeString(input) {
    let raw = String(input || "").trim();
    if (!raw)
        return null;
    if (raw.startsWith("```")) {
        const firstNl = raw.indexOf("\n");
        const lastFence = raw.lastIndexOf("```");
        if (firstNl > -1 && lastFence > firstNl)
            raw = raw.slice(firstNl + 1, lastFence).trim();
    }
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace > -1 && lastBrace > firstBrace)
        raw = raw.slice(firstBrace, lastBrace + 1);
    if (!raw.startsWith("{"))
        return null;
    try {
        const parsed = JSON.parse(raw);
        return isRecord(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function normalizeTableBlock(block) {
    const { headers, rows, data, ...rest } = block;
    const dataObj = isRecord(data) ? data : null;
    const contentObj = isRecord(block.content) ? block.content : null;
    const normalizedHeaders = Array.isArray(headers)
        ? headers.map(String)
        : Array.isArray(contentObj?.headers)
            ? (contentObj?.headers).map(String)
            : Array.isArray(dataObj?.headers)
                ? (dataObj?.headers).map(String)
                : [];
    const normalizedRows = Array.isArray(rows)
        ? rows
        : Array.isArray(contentObj?.rows)
            ? contentObj?.rows
            : Array.isArray(dataObj?.rows)
                ? dataObj?.rows
                : [];
    const normalizedData = Array.isArray(data)
        ? data
        : Array.isArray(contentObj)
            ? contentObj
            : Array.isArray(dataObj)
                ? dataObj
                : [];
    if (!normalizedHeaders.length && normalizedRows.length === 0 && normalizedData.length > 0) {
        const firstRow = Array.isArray(normalizedData[0]) ? normalizedData[0].map(String) : [];
        const bodyRows = normalizedData.slice(1).map((r) => (Array.isArray(r) ? r.map(String) : []));
        return { ...rest, type: "table", headers: firstRow, rows: bodyRows };
    }
    if (!normalizedHeaders.length && normalizedData.length > 0 && normalizedRows.length === 0) {
        return {
            ...rest,
            type: "table",
            headers: [],
            rows: normalizedData.map((r) => (Array.isArray(r) ? r.map(String) : [])),
        };
    }
    if (normalizedHeaders.length && normalizedRows.length === 0 && normalizedData.length > 0) {
        return {
            ...rest,
            type: "table",
            headers: normalizedHeaders,
            rows: normalizedData.map((r) => (Array.isArray(r) ? r.map(String) : [])),
        };
    }
    return {
        ...rest,
        type: "table",
        headers: normalizedHeaders,
        rows: normalizedRows.map((r) => (Array.isArray(r) ? r.map(String) : [])),
    };
}
function normalizeBlocks(blocks) {
    return blocks.map((raw) => {
        const b = isRecord(raw) ? raw : {};
        const t = String(b.type || "").toLowerCase();
        const dataObj = b.data && isRecord(b.data) ? b.data : null;
        if (t === "markdown") {
            const md = typeof b.markdown === "string"
                ? b.markdown
                : typeof b.content === "string"
                    ? b.content
                    : typeof dataObj?.content === "string"
                        ? dataObj.content
                        : typeof dataObj?.markdown === "string"
                            ? dataObj.markdown
                            : "";
            const rest = { ...b };
            delete rest.content;
            delete rest.markdown;
            return md ? { ...rest, type: "markdown", markdown: md } : { ...rest, type: "markdown" };
        }
        if (t === "code") {
            const code = typeof b.code === "string"
                ? b.code
                : typeof b.content === "string"
                    ? b.content
                    : typeof dataObj?.content === "string"
                        ? dataObj.content
                        : typeof dataObj?.code === "string"
                            ? dataObj.code
                            : "";
            const rest = { ...b };
            delete rest.content;
            delete rest.code;
            return code
                ? {
                    ...rest,
                    type: "code",
                    language: typeof b.language === "string" ? b.language : typeof dataObj?.language === "string" ? dataObj.language : "plain",
                    code,
                }
                : {
                    ...rest,
                    type: "code",
                    language: typeof b.language === "string" ? b.language : typeof dataObj?.language === "string" ? dataObj.language : "plain",
                };
        }
        if (t === "table")
            return normalizeTableBlock(b);
        return isRecord(raw) ? raw : { type: "text", text: String(raw ?? "") };
    });
}
function finalizeNormalizedContent(content, blocks) {
    const title = typeof content.title === "string" ? content.title.trim() : "";
    const summary = typeof content.summary === "string" ? content.summary.trim() : "";
    const language = typeof content.language === "string" ? content.language.trim() : "";
    const options = isRecord(content.options) ? content.options : null;
    const images = Array.isArray(content.images) ? content.images : null;
    const audio = isRecord(content.audio) ? content.audio : null;
    const video = isRecord(content.video) ? content.video : null;
    const attachments = Array.isArray(content.attachments) ? (content.attachments || []) : null;
    const base = { blocks };
    if (title)
        base.title = title;
    if (summary)
        base.summary = summary;
    if (language)
        base.language = language;
    if (options)
        base.options = options;
    if (images)
        base.images = images;
    if (audio)
        base.audio = audio;
    if (video)
        base.video = video;
    if (attachments)
        base.attachments = attachments;
    return base;
}
function coerceFromOutputText(content) {
    const raw = content.output_text;
    if (typeof raw !== "string" || !raw.trim())
        return null;
    const parsed = parseJsonLikeString(raw);
    if (!parsed)
        return null;
    const normalized = normalizeAiContent(parsed);
    return normalized;
}
function buildMarkdownFromSteps(steps) {
    const normalized = steps
        .map((s, i) => {
        if (typeof s === "string")
            return `${i + 1}. ${s}`;
        if (!s || typeof s !== "object")
            return "";
        const obj = s;
        const label = typeof obj.step === "string" ? obj.step : `Step ${i + 1}`;
        const content = typeof obj.content === "string" ? obj.content : typeof obj.description === "string" ? obj.description : "";
        const details = typeof obj.details === "string" ? obj.details : "";
        const formula = typeof obj.formula === "string" ? obj.formula : "";
        const parts = [content, details, formula ? `수식: ${formula}` : ""].filter(Boolean).join(" ");
        return parts ? `${i + 1}. ${label} - ${parts}` : `${i + 1}. ${label}`;
    })
        .filter(Boolean);
    if (!normalized.length)
        return "";
    return `## 풀이 절차\n${normalized.join("\n")}`;
}
function coerceTableFromObject(obj) {
    if (!obj)
        return null;
    const headers = Array.isArray(obj.headers)
        ? obj.headers.map(String)
        : Array.isArray(obj.columns)
            ? obj.columns.map(String)
            : [];
    const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
    const rows = rowsRaw.map((r) => (Array.isArray(r) ? r.map(String) : []));
    if (!headers.length && !rows.length)
        return null;
    return { type: "table", headers, rows };
}
function normalizeAiContent(content) {
    if (typeof content === "string") {
        const parsed = parseJsonLikeString(content);
        if (parsed)
            return normalizeAiContent(parsed);
        return finalizeNormalizedContent({}, [{ type: "markdown", markdown: content }]);
    }
    if (!isRecord(content))
        return finalizeNormalizedContent({}, [{ type: "markdown", markdown: String(content ?? "") }]);
    const fromOutputText = coerceFromOutputText(content);
    if (fromOutputText)
        return fromOutputText;
    const outputText = typeof content.output_text === "string" ? content.output_text.trim() : "";
    const topMarkdown = typeof content.markdown === "string" ? content.markdown.trim() : "";
    if (topMarkdown) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: topMarkdown }]);
    }
    const textValue = typeof content.text === "string" ? content.text.trim() : "";
    if (textValue) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: textValue }]);
    }
    const answerText = typeof content.answer === "string" ? content.answer.trim() : "";
    if (answerText) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: answerText }]);
    }
    const responseText = typeof content.response === "string" ? content.response.trim() : "";
    if (responseText) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: responseText }]);
    }
    // Some models return a minimal JSON like {"message":"..."}.
    // Normalize it into block-json so the frontend viewer can render consistently.
    const messageText = typeof content.message === "string" ? content.message.trim() : "";
    if (messageText) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: messageText }]);
    }
    // Some models return {"reply":"..."} instead of {"message":"..."}.
    const replyText = typeof content.reply === "string" ? content.reply.trim() : "";
    if (replyText) {
        return finalizeNormalizedContent(content, [{ type: "markdown", markdown: replyText }]);
    }
    const blocks = Array.isArray(content.blocks) ? content.blocks : null;
    if (!blocks || blocks.length === 0) {
        if (outputText) {
            return finalizeNormalizedContent(content, [{ type: "markdown", markdown: outputText }]);
        }
        const summaryText = typeof content.summary === "string" ? content.summary.trim() : "";
        const stepsRaw = Array.isArray(content.steps) ? content.steps : [];
        const stepsMarkdown = stepsRaw.length ? buildMarkdownFromSteps(stepsRaw) : "";
        const keyTerms = coerceTableFromObject(isRecord(content.key_terms) ? content.key_terms : null);
        const analysisTable = coerceTableFromObject(isRecord(content.analysis_table) ? content.analysis_table : null);
        const fallbackBlocks = [
            summaryText ? { type: "markdown", markdown: `## 핵심 개요\n${summaryText}` } : null,
            stepsMarkdown ? { type: "markdown", markdown: stepsMarkdown } : null,
            keyTerms || analysisTable,
        ].filter(Boolean);
        if (fallbackBlocks.length)
            return finalizeNormalizedContent(content, fallbackBlocks);
        return finalizeNormalizedContent(content, []);
    }
    return finalizeNormalizedContent(content, normalizeBlocks(blocks));
}
