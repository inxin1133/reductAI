"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPostContent = getPostContent;
exports.savePostContent = savePostContent;
exports.createPost = createPost;
exports.listMyPages = listMyPages;
exports.getPostPreview = getPostPreview;
const db_1 = __importStar(require("../config/db"));
const docMapping_1 = require("../services/docMapping");
const systemTenantService_1 = require("../services/systemTenantService");
const crypto_1 = require("crypto");
function parseIntOrNull(v) {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
}
async function getPostMetaVersion(postId) {
    const r = await (0, db_1.query)(`SELECT COALESCE((metadata->>'doc_version')::int, 0) AS v FROM posts WHERE id = $1`, [
        postId,
    ]);
    if (r.rows.length === 0)
        return 0;
    return Number(r.rows[0]?.v || 0);
}
async function getPostContent(req, res) {
    try {
        const { id } = req.params;
        const version = await getPostMetaVersion(id);
        const r = await (0, db_1.query)(`SELECT id, post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id
       FROM post_blocks
       WHERE post_id = $1 AND parent_block_id IS NULL AND is_deleted = FALSE
       ORDER BY sort_key ASC`, [id]);
        const docJson = (0, docMapping_1.blocksToDocJson)(r.rows);
        return res.json({ docJson, version });
    }
    catch (e) {
        console.error("post-service getPostContent error:", e);
        return res.status(500).json({ message: "Failed to load post content" });
    }
}
async function savePostContent(req, res) {
    const client = await db_1.default.connect();
    try {
        const { id } = req.params;
        const body = req.body;
        if (!body?.docJson || typeof body.docJson !== "object") {
            return res.status(400).json({ message: "docJson is required" });
        }
        const requestedVersion = parseIntOrNull(body.version);
        const pmSchemaVersion = typeof body.pmSchemaVersion === "number" ? body.pmSchemaVersion : 1;
        await client.query("BEGIN");
        const postRow = await client.query(`SELECT id, metadata
       FROM posts
       WHERE id = $1
       FOR UPDATE`, [id]);
        if (postRow.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Post not found" });
        }
        const cur = Number(postRow.rows[0]?.metadata?.doc_version ?? 0) || 0;
        if (requestedVersion !== null && requestedVersion !== cur) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Version conflict",
                currentVersion: cur,
            });
        }
        // Replace-all strategy for MVP: delete existing blocks and re-insert from docJson.
        await client.query(`DELETE FROM post_blocks WHERE post_id = $1`, [id]);
        const blocks = (0, docMapping_1.docJsonToBlocks)({ postId: id, docJson: body.docJson, pmSchemaVersion });
        for (const b of blocks) {
            await client.query(`INSERT INTO post_blocks (
           post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id,
           is_deleted, pm_schema_version
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9)`, [
                id,
                b.parent_block_id,
                b.block_type,
                b.sort_key,
                b.content,
                b.content_text,
                b.ref_post_id,
                b.external_embed_id,
                pmSchemaVersion,
            ]);
        }
        const nextVersion = cur + 1;
        await client.query(`UPDATE posts
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{doc_version}', to_jsonb($2::int), true)
       WHERE id = $1`, [id, nextVersion]);
        await client.query("COMMIT");
        return res.json({ ok: true, version: nextVersion });
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service savePostContent error:", e);
        return res.status(500).json({ message: "Failed to save post content" });
    }
    finally {
        client.release();
    }
}
async function createPost(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const body = (req.body || {});
        const tenantId = req.tenantId || (await (0, systemTenantService_1.ensureSystemTenantId)());
        const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled";
        const pageType = typeof body.page_type === "string" ? body.page_type : "page";
        const visibility = typeof body.visibility === "string" ? body.visibility : "private";
        const status = typeof body.status === "string" ? body.status : "draft";
        // slug must be unique within (tenant_id,parent_id)
        const slug = `page-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
        await client.query("BEGIN");
        const r = await client.query(`INSERT INTO posts (
         tenant_id, parent_id, category_id, author_id, title, slug, page_type, status, visibility, metadata
       )
       VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id, title, slug, created_at, updated_at`, [tenantId, userId, title, slug, pageType, status, visibility, JSON.stringify({ doc_version: 0 })]);
        await client.query("COMMIT");
        return res.status(201).json(r.rows[0]);
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service createPost error:", e);
        return res.status(500).json({ message: "Failed to create post" });
    }
    finally {
        client.release();
    }
}
async function listMyPages(req, res) {
    try {
        const userId = req.userId;
        const r = await (0, db_1.query)(`SELECT id, parent_id, title, slug, page_type, status, visibility, child_count, page_order, updated_at
       FROM posts
       WHERE author_id = $1 AND deleted_at IS NULL
       ORDER BY parent_id NULLS FIRST, page_order ASC, updated_at DESC`, [userId]);
        return res.json(r.rows);
    }
    catch (e) {
        console.error("post-service listMyPages error:", e);
        return res.status(500).json({ message: "Failed to list pages" });
    }
}
async function getPostPreview(req, res) {
    try {
        const { id } = req.params;
        const p = await (0, db_1.query)(`SELECT id, title, excerpt, updated_at
       FROM posts
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`, [id]);
        if (p.rows.length === 0)
            return res.status(404).json({ message: "Post not found" });
        const row = p.rows[0];
        let summary = typeof row.excerpt === "string" ? row.excerpt : "";
        if (!summary) {
            const blocks = await (0, db_1.query)(`SELECT content_text
         FROM post_blocks
         WHERE post_id = $1 AND is_deleted = FALSE
         ORDER BY sort_key ASC
         LIMIT 5`, [id]);
            summary = (blocks.rows || [])
                .map((b) => (typeof b.content_text === "string" ? b.content_text : ""))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
        }
        if (summary.length > 140)
            summary = summary.slice(0, 140) + "…";
        return res.json({ id: row.id, title: row.title, summary, updated_at: row.updated_at });
    }
    catch (e) {
        console.error("post-service getPostPreview error:", e);
        return res.status(500).json({ message: "Failed to load preview" });
    }
}
