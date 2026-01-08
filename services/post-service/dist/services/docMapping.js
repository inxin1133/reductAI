"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blocksToDocJson = blocksToDocJson;
exports.docJsonToBlocks = docJsonToBlocks;
function extractTextFromPm(node) {
    if (!node)
        return "";
    if (node.type === "text")
        return String(node.text || "");
    if (node.type === "mention")
        return node?.attrs?.label ? `@${node.attrs.label}` : "@mention";
    if (node.type === "page_link")
        return node?.attrs?.title ? String(node.attrs.title) : "page";
    const parts = [];
    const content = Array.isArray(node.content) ? node.content : [];
    for (const c of content) {
        const t = extractTextFromPm(c);
        if (t)
            parts.push(t);
    }
    return parts.join("");
}
function blocksToDocJson(blocks) {
    const content = [];
    for (const b of blocks) {
        const pmNode = (b?.content && (b.content.pm || b.content)) || null;
        if (pmNode)
            content.push(pmNode);
    }
    return { type: "doc", content };
}
function docJsonToBlocks(args) {
    const { postId, docJson } = args;
    const pmSchemaVersion = args.pmSchemaVersion ?? 1;
    const children = Array.isArray(docJson?.content) ? docJson.content : [];
    const blocks = [];
    let sort = 1000;
    for (const node of children) {
        const blockType = String(node?.type || "paragraph");
        const contentText = extractTextFromPm(node) || null;
        let refPostId = null;
        let externalEmbedId = null;
        if (blockType === "page_link") {
            const pid = node?.attrs?.pageId;
            if (typeof pid === "string" && pid.length > 0)
                refPostId = pid;
        }
        if (blockType === "external_embed") {
            const eid = node?.attrs?.externalEmbedId;
            if (typeof eid === "string" && eid.length > 0)
                externalEmbedId = eid;
        }
        // Store the PM node as-is under {pm: ...} so block rows stay extensible.
        blocks.push({
            parent_block_id: null,
            block_type: blockType,
            sort_key: sort,
            content: { pm: node, postId },
            content_text: contentText,
            ref_post_id: refPostId,
            external_embed_id: externalEmbedId,
            pm_schema_version: pmSchemaVersion,
        });
        sort += 1000;
    }
    return blocks;
}
