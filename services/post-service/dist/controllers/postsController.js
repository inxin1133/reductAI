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
exports.listMyPageCategories = listMyPageCategories;
exports.createMyPageCategory = createMyPageCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
exports.reorderCategories = reorderCategories;
exports.getCurrentTenant = getCurrentTenant;
exports.updatePostCategory = updatePostCategory;
exports.getPostPreview = getPostPreview;
exports.updatePost = updatePost;
exports.listDeletedPages = listDeletedPages;
exports.getDeletedPageDetail = getDeletedPageDetail;
exports.restoreDeletedPage = restoreDeletedPage;
exports.purgeDeletedPage = purgeDeletedPage;
exports.movePage = movePage;
const db_1 = __importStar(require("../config/db"));
const docMapping_1 = require("../services/docMapping");
const systemTenantService_1 = require("../services/systemTenantService");
const crypto_1 = require("crypto");
const MEDIA_ASSET_URL_RE = /(?:https?:\/\/[^/]+)?\/api\/ai\/media\/assets\/([0-9a-f-]{36})/gi;
function parseIntOrNull(v) {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
}
function slugify(input) {
    return String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 60);
}
function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
async function assertCategoryAccess(args) {
    const { categoryId, tenantId, userId } = args;
    const r = await (0, db_1.query)(`SELECT id, category_type, COALESCE(user_id, author_id) AS owner_id
     FROM board_categories
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     LIMIT 1`, [categoryId, tenantId]);
    if (r.rows.length === 0)
        throw new Error("Invalid category_id");
    const row = r.rows[0];
    const type = String(row.category_type || "");
    if (type === "personal_page") {
        if (String(row.owner_id || "") !== String(userId))
            throw new Error("Forbidden category_id");
    }
    return { id: row.id, category_type: type };
}
async function resolveTenantId(req) {
    const tid = req.tenantId ? String(req.tenantId) : "";
    if (tid) {
        const r = await (0, db_1.query)(`SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [tid]);
        if (r.rows.length > 0)
            return tid;
    }
    return await (0, systemTenantService_1.ensureSystemTenantId)();
}
async function tenantAllowsSharedPages(tenantId) {
    const r = await (0, db_1.query)(`SELECT tenant_type FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [tenantId]);
    const tt = String(r.rows[0]?.tenant_type || "");
    // User request: Team + Group both should show "팀 페이지" section (exclude Personal)
    return tt !== "personal";
}
async function getPostMetaVersion(postId) {
    const r = await (0, db_1.query)(`SELECT COALESCE((metadata->>'doc_version')::int, 0) AS v FROM posts WHERE id = $1`, [
        postId,
    ]);
    if (r.rows.length === 0)
        return 0;
    return Number(r.rows[0]?.v || 0);
}
function extractMediaAssetIdsFromDocJson(docJson) {
    const found = new Set();
    const visit = (val) => {
        if (val == null)
            return;
        if (typeof val === "string") {
            for (const m of val.matchAll(MEDIA_ASSET_URL_RE)) {
                const id = m[1];
                if (id)
                    found.add(id);
            }
            return;
        }
        if (Array.isArray(val)) {
            for (const item of val)
                visit(item);
            return;
        }
        if (typeof val === "object") {
            for (const v of Object.values(val))
                visit(v);
        }
    };
    visit(docJson);
    return Array.from(found);
}
async function getPostContent(req, res) {
    try {
        const { id } = req.params;
        const version = await getPostMetaVersion(id);
        const p = await (0, db_1.query)(`SELECT id, title, icon, category_id, status, deleted_at
       FROM posts
       WHERE id = $1
       LIMIT 1`, [id]);
        if (p.rows.length === 0)
            return res.status(404).json({ message: "Post not found" });
        const r = await (0, db_1.query)(`SELECT id, post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id
       FROM post_blocks
       WHERE post_id = $1 AND parent_block_id IS NULL AND is_deleted = FALSE
       ORDER BY sort_key ASC`, [id]);
        const docJson = (0, docMapping_1.blocksToDocJson)(r.rows);
        const row = p.rows[0];
        return res.json({
            docJson,
            version,
            title: row.title,
            icon: row.icon ?? null,
            category_id: row.category_id ?? null,
            status: row.status,
            deleted_at: row.deleted_at,
        });
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
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const body = req.body;
        if (!body?.docJson || typeof body.docJson !== "object") {
            return res.status(400).json({ message: "docJson is required" });
        }
        const requestedVersion = parseIntOrNull(body.version);
        const pmSchemaVersion = typeof body.pmSchemaVersion === "number" ? body.pmSchemaVersion : 1;
        await client.query("BEGIN");
        const postRow = await client.query(`SELECT id, author_id, metadata
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
        // If embed blocks were removed, mark the corresponding child pages as deleted.
        // We only delete pages that are true children (posts.parent_id = this post id) and owned by the same user.
        const prevBlocks = await client.query(`SELECT ref_post_id, content
       FROM post_blocks
       WHERE post_id = $1 AND block_type = 'page_link'`, [id]);
        const prevEmbedIds = new Set();
        for (const row of prevBlocks.rows) {
            const pid = typeof row.ref_post_id === "string" ? row.ref_post_id : null;
            if (!pid)
                continue;
            const pm = row.content?.pm || row.content;
            const display = pm?.attrs?.display;
            if (display === "embed")
                prevEmbedIds.add(pid);
        }
        // Replace-all strategy for MVP: delete existing blocks and re-insert from docJson.
        await client.query(`DELETE FROM post_blocks WHERE post_id = $1`, [id]);
        const blocks = (0, docMapping_1.docJsonToBlocks)({ postId: id, docJson: body.docJson, pmSchemaVersion });
        const rawAssetIds = extractMediaAssetIdsFromDocJson(body.docJson);
        const assetIds = Array.from(new Set(rawAssetIds.map(String))).filter((v) => isUuid(v));
        // Maintain file_asset_post_links with stable created_at:
        // - Delete only removed links
        // - Upsert current links (preserve created_at for existing)
        const existingLinksRes = await client.query(`SELECT asset_id FROM file_asset_post_links WHERE post_id = $1`, [id]);
        const existingAssetIds = (existingLinksRes.rows || [])
            .map((r) => String(r?.asset_id || ""))
            .filter((v) => isUuid(v));
        const desiredSet = new Set(assetIds);
        const toRemove = existingAssetIds.filter((aid) => !desiredSet.has(aid));
        if (toRemove.length) {
            await client.query(`DELETE FROM file_asset_post_links WHERE post_id = $1 AND asset_id = ANY($2::uuid[])`, [id, toRemove]);
        }
        if (assetIds.length) {
            const metaRes = await client.query(`
        SELECT bc.category_type, COALESCE(bc.user_id, bc.author_id) AS owner_id
        FROM posts p
        LEFT JOIN board_categories bc ON bc.id = p.category_id
        WHERE p.id = $1
        LIMIT 1
        `, [id]);
            const categoryType = String(metaRes.rows?.[0]?.category_type || "");
            const scopeType = categoryType === "team_page" ? "team_page" : "personal_page";
            const ownerId = String(metaRes.rows?.[0]?.owner_id || userId || "");
            await client.query(`
        UPDATE file_assets
        SET expires_at = NULL,
            metadata = jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(COALESCE(metadata, '{}'::jsonb), '{pinned_by_post}', 'true'::jsonb, true),
                    '{pinned_scope}', to_jsonb($2::text), true
                  ),
                  '{pinned_owner_id}', to_jsonb($3::text), true
                ),
                '{pinned_tenant_id}', to_jsonb($4::text), true
              ),
              '{pinned_post_id}', to_jsonb($5::text), true
            )
        WHERE id = ANY($1::uuid[])
        `, [assetIds, scopeType, ownerId, tenantId, id]);
            const ownerForLink = scopeType === "personal_page" ? ownerId : null;
            const tenantForLink = scopeType === "team_page" ? tenantId : null;
            await client.query(`
        INSERT INTO file_asset_post_links
          (asset_id, post_id, scope_type, owner_user_id, tenant_id, created_at, updated_at)
        SELECT a, $2, $3, $4, $5, NOW(), NOW()
        FROM UNNEST($1::uuid[]) AS a
        ON CONFLICT (asset_id, post_id)
        DO UPDATE SET
          scope_type = EXCLUDED.scope_type,
          owner_user_id = EXCLUDED.owner_user_id,
          tenant_id = EXCLUDED.tenant_id,
          updated_at = NOW()
        `, [assetIds, id, scopeType, ownerForLink, tenantForLink]);
        }
        // Guard against invalid page_link refs (missing posts) to avoid FK errors.
        const refIds = Array.from(new Set(blocks
            .map((b) => (typeof b.ref_post_id === "string" ? b.ref_post_id : null))
            .filter((v) => Boolean(v))));
        const validRefIds = new Set();
        if (refIds.length) {
            const refRes = await client.query(`SELECT id FROM posts WHERE id = ANY($1::uuid[])`, [refIds]);
            for (const row of refRes.rows) {
                validRefIds.add(String(row.id));
            }
        }
        const nextEmbedIds = new Set();
        for (const b of blocks) {
            if (b.block_type !== "page_link")
                continue;
            const pm = b.content?.pm || b.content;
            const display = pm?.attrs?.display;
            const pid = typeof b.ref_post_id === "string" ? b.ref_post_id : null;
            if (display === "embed" && pid && validRefIds.has(pid))
                nextEmbedIds.add(pid);
        }
        for (const b of blocks) {
            const refId = typeof b.ref_post_id === "string" ? b.ref_post_id : null;
            if (refId && !validRefIds.has(refId)) {
                continue;
            }
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
        // Mark removed embeds' pages as deleted.
        const removed = [];
        for (const pid of prevEmbedIds) {
            if (!nextEmbedIds.has(pid))
                removed.push(pid);
        }
        if (removed.length) {
            await client.query(`UPDATE posts
         SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND parent_id = $2
           AND author_id = $3
           AND deleted_at IS NULL`, [removed, id, userId]);
        }
        // If embeds were re-added (undo), restore those child pages.
        const restoreIds = Array.from(nextEmbedIds);
        if (restoreIds.length) {
            await client.query(`UPDATE posts
         SET status = 'draft', deleted_at = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND parent_id = $2
           AND author_id = $3
           AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')`, [restoreIds, id, userId]);
        }
        // Keep children ordering in sync with the embed order inside this parent page.
        // Topmost embed block => smallest page_order (appears first in tree).
        const embedOrder = [];
        const embedSeen = new Set();
        for (const b of blocks) {
            if (b.block_type !== "page_link")
                continue;
            const pm = b.content?.pm || b.content;
            const display = pm?.attrs?.display;
            const pid = typeof b.ref_post_id === "string" ? b.ref_post_id : null;
            if (display === "embed" && pid && !embedSeen.has(pid)) {
                embedSeen.add(pid);
                embedOrder.push(pid);
            }
        }
        if (embedOrder.length) {
            const ords = embedOrder.map((_, i) => i + 1);
            await client.query(`WITH ord AS (
           SELECT *
           FROM unnest($1::uuid[], $2::int[]) AS t(id, ord)
         )
         UPDATE posts p
         SET page_order = ord.ord
         FROM ord
         WHERE p.id = ord.id
           AND p.parent_id = $3
           AND p.author_id = $4`, [embedOrder, ords, id, userId]);
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
        const tenantId = await resolveTenantId(req);
        const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled";
        const pageType = typeof body.page_type === "string" ? body.page_type : "page";
        const visibility = typeof body.visibility === "string" ? body.visibility : "private";
        const status = typeof body.status === "string" ? body.status : "draft";
        const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;
        const categoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null;
        // slug must be unique within (tenant_id,parent_id)
        const slug = `page-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
        await client.query("BEGIN");
        // Validate parent_id (must exist and be owned by same user) if provided
        // Also inherit parent's category_id if none provided explicitly
        let effectiveCategoryId = categoryId;
        if (parentId) {
            const p = await client.query(`SELECT id, category_id
         FROM posts
         WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
         LIMIT 1`, [parentId, userId]);
            if (p.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid parent_id" });
            }
            // Inherit parent's category_id if child doesn't specify one
            if (!effectiveCategoryId && p.rows[0].category_id) {
                effectiveCategoryId = p.rows[0].category_id;
            }
        }
        // Validate category if provided (or inherited)
        if (effectiveCategoryId) {
            await assertCategoryAccess({ categoryId: effectiveCategoryId, tenantId, userId });
        }
        const r = await client.query(`INSERT INTO posts (
         tenant_id, parent_id, category_id, author_id, title, slug, page_type, status, visibility, metadata
       )
       VALUES ($1,$9,$10,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id, parent_id, title, slug, created_at, updated_at`, [tenantId, userId, title, slug, pageType, status, visibility, JSON.stringify({ doc_version: 0 }), parentId, effectiveCategoryId]);
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
        const categoryId = typeof req.query.categoryId === "string" ? String(req.query.categoryId).trim() : "";
        const tenantId = await resolveTenantId(req);
        let sql = `SELECT id, parent_id, category_id, title, icon, slug, page_type, status, visibility, child_count, page_order, updated_at
       FROM posts
       WHERE tenant_id = $1 AND author_id = $2 AND deleted_at IS NULL AND COALESCE(status, '') <> 'deleted'`;
        const params = [tenantId, userId];
        if (categoryId) {
            if (categoryId === "null") {
                sql += ` AND category_id IS NULL`;
            }
            else {
                sql += ` AND category_id = $3`;
                params.push(categoryId);
            }
        }
        sql += `
       -- IMPORTANT: keep ordering stable; opening/saving a page updates updated_at and should NOT reshuffle the tree.
       ORDER BY parent_id NULLS FIRST, page_order ASC, created_at DESC, id DESC`;
        const r = await (0, db_1.query)(sql, params);
        return res.json(r.rows);
    }
    catch (e) {
        console.error("post-service listMyPages error:", e);
        return res.status(500).json({ message: "Failed to list pages" });
    }
}
// Personal page categories (for Sidebar grouping)
async function listMyPageCategories(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const type = typeof req.query.type === "string" ? String(req.query.type) : "personal_page";
        const categoryType = type === "team_page" ? "team_page" : "personal_page";
        // Shared/Team categories exist when the current tenant is NOT personal (team + group).
        if (categoryType === "team_page") {
            const ok = await tenantAllowsSharedPages(tenantId);
            if (!ok)
                return res.json([]);
        }
        await client.query("BEGIN");
        // Ensure default category exists ONLY once:
        // - Create when there has never been any category row for this scope (including deleted rows).
        // - If user deletes all categories (soft delete), we do NOT recreate.
        const defaultName = categoryType === "team_page" ? "공유 페이지" : "나의 페이지";
        const anyEver = await client.query(`SELECT 1
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
       LIMIT 1`, [tenantId, userId, categoryType]);
        const existsActive = await client.query(`SELECT 1
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
         AND deleted_at IS NULL
       LIMIT 1`, [tenantId, userId, categoryType]);
        if (anyEver.rows.length === 0 && existsActive.rows.length === 0) {
            const base = slugify(defaultName) || "category";
            const slug = `${base}-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
            const maxR = await client.query(`SELECT COALESCE(MAX(display_order), 0) AS m
         FROM board_categories
         WHERE tenant_id = $1 AND category_type = $3 AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2) AND deleted_at IS NULL`, [tenantId, userId, categoryType]);
            const nextOrder = Number(maxR.rows[0]?.m || 0) + 1;
            await client.query(`INSERT INTO board_categories (tenant_id, author_id, user_id, category_type, parent_id, name, slug, icon, display_order, is_active, metadata)
         VALUES ($1, $2, $2, $3, NULL, $4, $5, NULL, $6, TRUE, '{}'::jsonb)`, [tenantId, userId, categoryType, defaultName, slug, nextOrder]);
        }
        const r = await client.query(`SELECT id, parent_id, name, slug, icon, display_order, created_at, updated_at
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
         AND deleted_at IS NULL
       ORDER BY display_order ASC, created_at ASC, id ASC`, [tenantId, userId, categoryType]);
        await client.query("COMMIT");
        return res.json(r.rows);
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service listMyPageCategories error:", e);
        return res.status(500).json({ message: "Failed to list categories" });
    }
    finally {
        client.release();
    }
}
async function createMyPageCategory(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const body = (req.body || {});
        const type = typeof body.type === "string" ? body.type : "personal_page";
        const categoryType = type === "team_page" ? "team_page" : "personal_page";
        const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New category";
        const icon = typeof body.icon === "string" ? body.icon.trim().slice(0, 100) : null;
        if (categoryType === "team_page") {
            const ok = await tenantAllowsSharedPages(tenantId);
            if (!ok)
                return res.status(400).json({ message: "Shared categories require a non-personal tenant" });
        }
        const base = slugify(name) || "category";
        const slug = `${base}-${(0, crypto_1.randomUUID)().slice(0, 8)}`;
        await client.query("BEGIN");
        const maxR = await client.query(`SELECT COALESCE(MAX(display_order), 0) AS m
       FROM board_categories
       WHERE tenant_id = $1 AND category_type = $3 AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2) AND deleted_at IS NULL`, [tenantId, userId, categoryType]);
        const nextOrder = Number(maxR.rows[0]?.m || 0) + 1;
        const ins = await client.query(`INSERT INTO board_categories (tenant_id, author_id, user_id, category_type, parent_id, name, slug, icon, display_order, is_active, metadata)
       VALUES ($1, $2, $2, $3, NULL, $4, $5, $6, $7, TRUE, '{}'::jsonb)
       RETURNING id, parent_id, name, slug, icon, display_order, created_at, updated_at`, [tenantId, userId, categoryType, name, slug, icon, nextOrder]);
        await client.query("COMMIT");
        return res.status(201).json(ins.rows[0]);
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service createMyPageCategory error:", e);
        return res.status(500).json({ message: "Failed to create category" });
    }
    finally {
        client.release();
    }
}
async function updateCategory(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const body = (req.body || {});
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const iconProvided = "icon" in body;
        const iconRaw = iconProvided ? body.icon : undefined;
        const icon = typeof iconRaw === "string" ? iconRaw.trim().slice(0, 100) : iconRaw === null ? null : undefined;
        const displayOrder = typeof body.display_order === "number" ? body.display_order : null;
        if (!name && icon === undefined && displayOrder === null) {
            return res.status(400).json({ message: "name, icon or display_order is required" });
        }
        // Ensure category exists & ownership rules (personal_page requires author match)
        const cur = await (0, db_1.query)(`SELECT id, category_type, COALESCE(user_id, author_id) AS owner_id
       FROM board_categories
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       LIMIT 1`, [id, tenantId]);
        if (cur.rows.length === 0)
            return res.status(404).json({ message: "Category not found" });
        const row = cur.rows[0];
        if (String(row.category_type) === "personal_page" && String(row.owner_id || "") !== String(userId)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        const sets = [];
        const vals = [id, tenantId];
        let idx = 3;
        if (name) {
            sets.push(`name = $${idx}`);
            vals.push(name);
            idx += 1;
        }
        if (icon !== undefined) {
            sets.push(`icon = $${idx}`);
            vals.push(icon);
            idx += 1;
        }
        if (displayOrder !== null) {
            sets.push(`display_order = $${idx}`);
            vals.push(displayOrder);
            idx += 1;
        }
        sets.push(`updated_at = NOW()`);
        await client.query("BEGIN");
        const r = await client.query(`UPDATE board_categories
       SET ${sets.join(", ")}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, parent_id, name, slug, icon, display_order, updated_at`, vals);
        await client.query("COMMIT");
        return res.json(r.rows[0]);
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service updateCategory error:", e);
        return res.status(500).json({ message: "Failed to update category" });
    }
    finally {
        client.release();
    }
}
async function deleteCategory(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const cur = await client.query(`SELECT id, category_type, COALESCE(user_id, author_id) AS owner_id
       FROM board_categories
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       LIMIT 1`, [id, tenantId]);
        if (cur.rows.length === 0)
            return res.status(404).json({ message: "Category not found" });
        const row = cur.rows[0];
        if (String(row.category_type) === "personal_page" && String(row.owner_id || "") !== String(userId)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        // Can delete ONLY when all pages in this category are already deleted.
        const alive = await client.query(`SELECT COUNT(*)::int AS c
       FROM posts
       WHERE category_id = $1
         AND deleted_at IS NULL
         AND COALESCE(status, '') <> 'deleted'`, [id]);
        const c = Number(alive.rows[0]?.c || 0);
        if (c > 0) {
            return res.status(400).json({ message: "Category can be deleted only when all pages are deleted" });
        }
        await client.query("BEGIN");
        // Mark deleted posts in this category so Trash UI can warn "restores to uncategorized".
        await client.query(`
      UPDATE posts
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{category_lost}', 'true'::jsonb, true),
          updated_at = NOW()
      WHERE tenant_id = $1
        AND author_id = $2
        AND category_id = $3
        AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')
      `, [tenantId, userId, id]);
        // Hard delete category. FK on posts.category_id is ON DELETE SET NULL, so posts won't break.
        await client.query(`DELETE FROM board_categories WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
        // Cleanup any previously soft-deleted categories (best-effort, keeps DB tidy).
        await client.query(`DELETE FROM board_categories WHERE deleted_at IS NOT NULL AND tenant_id = $1`, [tenantId]).catch(() => null);
        await client.query("COMMIT");
        return res.json({ ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK").catch(() => null);
        console.error("post-service deleteCategory error:", e);
        return res.status(500).json({ message: "Failed to delete category" });
    }
    finally {
        client.release();
    }
}
async function reorderCategories(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const body = (req.body || {});
        const type = typeof body.type === "string" ? body.type : "personal_page";
        const categoryType = type === "team_page" ? "team_page" : "personal_page";
        const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String).filter(Boolean) : [];
        if (!orderedIds.length)
            return res.status(400).json({ message: "orderedIds is required" });
        await client.query("BEGIN");
        // ownership check for personal
        if (categoryType === "personal_page") {
            const owned = await client.query(`SELECT id FROM board_categories
         WHERE tenant_id = $1 AND category_type = 'personal_page' AND COALESCE(user_id, author_id) = $2 AND deleted_at IS NULL`, [tenantId, userId]);
            const set = new Set((owned.rows || []).map((r) => String(r.id)));
            for (const id of orderedIds)
                if (!set.has(String(id)))
                    throw new Error("Forbidden reorder");
        }
        for (let i = 0; i < orderedIds.length; i += 1) {
            await client.query(`UPDATE board_categories
         SET display_order = $4, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND category_type = $3 AND deleted_at IS NULL`, [orderedIds[i], tenantId, categoryType, i + 1]);
        }
        await client.query("COMMIT");
        return res.json({ ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service reorderCategories error:", e);
        return res.status(500).json({ message: "Failed to reorder categories" });
    }
    finally {
        client.release();
    }
}
async function getCurrentTenant(req, res) {
    try {
        const tenantId = await resolveTenantId(req);
        const r = await (0, db_1.query)(`SELECT id, name, tenant_type FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [tenantId]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Tenant not found" });
        return res.json({ id: r.rows[0].id, name: r.rows[0].name, tenant_type: r.rows[0].tenant_type });
    }
    catch (e) {
        console.error("post-service getCurrentTenant error:", e);
        return res.status(500).json({ message: "Failed to load tenant" });
    }
}
async function updatePostCategory(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const body = (req.body || {});
        const categoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null;
        if (categoryId)
            await assertCategoryAccess({ categoryId, tenantId, userId });
        const r = await client.query(`UPDATE posts
       SET category_id = $3, updated_at = NOW()
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id, category_id`, [id, userId, categoryId]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Post not found" });
        return res.json(r.rows[0]);
    }
    catch (e) {
        console.error("post-service updatePostCategory error:", e);
        return res.status(500).json({ message: "Failed to update post category" });
    }
    finally {
        client.release();
    }
}
async function getPostPreview(req, res) {
    try {
        const { id } = req.params;
        const p = await (0, db_1.query)(`SELECT id, title, icon, excerpt, updated_at, category_id
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
        return res.json({
            id: row.id,
            title: row.title,
            icon: row.icon ?? null,
            summary,
            updated_at: row.updated_at,
            category_id: row.category_id ?? null,
        });
    }
    catch (e) {
        console.error("post-service getPostPreview error:", e);
        return res.status(500).json({ message: "Failed to load preview" });
    }
}
async function updatePost(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const { id } = req.params;
        const body = (req.body || {});
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const status = typeof body.status === "string" ? body.status.trim() : "";
        const iconProvided = "icon" in body;
        const iconRaw = iconProvided ? body.icon : undefined;
        const icon = typeof iconRaw === "string"
            ? iconRaw.trim() || null
            : iconRaw === null
                ? null
                : undefined;
        if (!title && !status && icon === undefined)
            return res.status(400).json({ message: "title, status or icon is required" });
        if (typeof icon === "string" && icon.length > 100)
            return res.status(400).json({ message: "icon is too long" });
        const updates = [];
        const values = [id, userId];
        let idx = 3;
        if (title) {
            updates.push(`title = $${idx}`);
            values.push(title);
            idx += 1;
        }
        if (status) {
            // MVP: support "deleted" (trash) and "draft" (restore)
            if (status !== "deleted" && status !== "draft")
                return res.status(400).json({ message: "invalid status" });
            updates.push(`status = $${idx}`);
            values.push(status);
            idx += 1;
            if (status === "deleted")
                updates.push(`deleted_at = NOW()`);
            if (status === "draft")
                updates.push(`deleted_at = NULL`);
        }
        if (icon !== undefined) {
            updates.push(`icon = $${idx}`);
            values.push(icon);
            idx += 1;
        }
        updates.push(`updated_at = NOW()`);
        const r = await client.query(`UPDATE posts
       SET ${updates.join(", ")}
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id, parent_id, title, icon, status, deleted_at, updated_at`, values);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Post not found" });
        return res.json(r.rows[0]);
    }
    catch (e) {
        console.error("post-service updatePost error:", e);
        return res.status(500).json({ message: "Failed to update post" });
    }
    finally {
        client.release();
    }
}
function isDeletedRow(row) {
    const deletedAt = row && row.deleted_at;
    const status = row && row.status;
    return Boolean(deletedAt) || String(status || "").trim() === "deleted";
}
// --- Trash (deleted posts) ---
// List deleted pages (roots only). Children appear inside the deleted parent's detail view.
async function listDeletedPages(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const r = await (0, db_1.query)(`
      SELECT
        p.id,
        p.parent_id,
        p.title,
        p.icon,
        p.category_id,
        (COALESCE(p.metadata->>'category_lost','false')::boolean) AS category_lost,
        p.deleted_at,
        p.updated_at
      FROM posts p
      WHERE p.tenant_id = $1
        AND p.author_id = $2
        AND (p.deleted_at IS NOT NULL OR COALESCE(p.status,'') = 'deleted')
        AND (
          p.parent_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM posts parent
            WHERE parent.id = p.parent_id
              AND parent.tenant_id = $1
              AND parent.author_id = $2
              AND (parent.deleted_at IS NOT NULL OR COALESCE(parent.status,'') = 'deleted')
          )
        )
      ORDER BY p.updated_at DESC
      `, [tenantId, userId]);
        return res.json(r.rows);
    }
    catch (e) {
        console.error("post-service listDeletedPages error:", e);
        return res.status(500).json({ message: "Failed to list deleted pages" });
    }
}
// Deleted page detail: content + breadcrumb (ancestors) + deleted children
async function getDeletedPageDetail(req, res) {
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const pageId = String(id || "").trim();
        if (!pageId)
            return res.status(400).json({ message: "id is required" });
        const p = await (0, db_1.query)(`SELECT id, parent_id, title, icon, category_id, metadata, status, deleted_at, updated_at
       FROM posts
       WHERE id = $1 AND tenant_id = $2 AND author_id = $3
       LIMIT 1`, [pageId, tenantId, userId]);
        if (p.rows.length === 0)
            return res.status(404).json({ message: "Post not found" });
        const row = p.rows[0];
        if (!isDeletedRow(row))
            return res.status(400).json({ message: "Post is not deleted" });
        // content (reuse the same mapping as getPostContent)
        const version = await getPostMetaVersion(pageId);
        const blocks = await (0, db_1.query)(`SELECT id, post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id
       FROM post_blocks
       WHERE post_id = $1 AND parent_block_id IS NULL AND is_deleted = FALSE
       ORDER BY sort_key ASC`, [pageId]);
        const docJson = (0, docMapping_1.blocksToDocJson)(blocks.rows);
        // ancestors chain (for breadcrumb)
        const ancestors = await (0, db_1.query)(`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, title, icon, status, deleted_at, updated_at, 0 AS depth
        FROM posts
        WHERE id = $1 AND tenant_id = $2 AND author_id = $3
        UNION ALL
        SELECT p.id, p.parent_id, p.title, p.icon, p.status, p.deleted_at, p.updated_at, chain.depth + 1
        FROM posts p
        JOIN chain ON chain.parent_id = p.id
        WHERE p.tenant_id = $2 AND p.author_id = $3
      )
      SELECT id, parent_id, title, icon, status, deleted_at, updated_at, depth
      FROM chain
      WHERE depth > 0
      ORDER BY depth DESC
      `, [pageId, tenantId, userId]);
        // deleted children only (direct)
        const children = await (0, db_1.query)(`
      SELECT id, parent_id, title, icon, status, deleted_at, updated_at
      FROM posts
      WHERE tenant_id = $1
        AND author_id = $2
        AND parent_id = $3
        AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')
      ORDER BY page_order ASC, created_at ASC, id ASC
      `, [tenantId, userId, pageId]);
        return res.json({
            post: row,
            docJson,
            version,
            ancestors: ancestors.rows,
            children: children.rows,
        });
    }
    catch (e) {
        console.error("post-service getDeletedPageDetail error:", e);
        return res.status(500).json({ message: "Failed to load deleted page detail" });
    }
}
// Restore deleted page:
// - restore the page + all deleted descendants
// - restore deleted ancestors so the page returns under its original parent
async function restoreDeletedPage(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const pageId = String(id || "").trim();
        if (!pageId)
            return res.status(400).json({ message: "id is required" });
        const body = (req.body || {});
        const requestedCategoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null;
        await client.query("BEGIN");
        // Ensure the page exists + is deleted (ownership enforced)
        const cur = await client.query(`SELECT id, parent_id, category_id, metadata, status, deleted_at
       FROM posts
       WHERE id = $1 AND tenant_id = $2 AND author_id = $3
       FOR UPDATE`, [pageId, tenantId, userId]);
        if (cur.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Post not found" });
        }
        const row = cur.rows[0];
        if (!isDeletedRow(row)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Post is not deleted" });
        }
        const categoryLost = Boolean(row?.metadata?.category_lost) || row?.metadata?.category_lost === true || String(row?.metadata?.category_lost || "").toLowerCase() === "true";
        const needsCategory = !row?.category_id || categoryLost;
        if (needsCategory) {
            if (!requestedCategoryId) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "CATEGORY_REQUIRED" });
            }
            // Validate access to the chosen category.
            await assertCategoryAccess({ categoryId: requestedCategoryId, tenantId, userId });
        }
        else if (requestedCategoryId) {
            // If user explicitly picks a category even when not required, validate it too.
            await assertCategoryAccess({ categoryId: requestedCategoryId, tenantId, userId });
        }
        // collect ids: ancestors + subtree
        const ids = await client.query(`
      WITH RECURSIVE
      ancestors AS (
        SELECT id, parent_id
        FROM posts
        WHERE id = $1 AND tenant_id = $2 AND author_id = $3
        UNION ALL
        SELECT p.id, p.parent_id
        FROM posts p
        JOIN ancestors a ON a.parent_id = p.id
        WHERE p.tenant_id = $2 AND p.author_id = $3
      ),
      subtree AS (
        SELECT id, parent_id
        FROM posts
        WHERE id = $1 AND tenant_id = $2 AND author_id = $3
        UNION ALL
        SELECT p.id, p.parent_id
        FROM posts p
        JOIN subtree s ON p.parent_id = s.id
        WHERE p.tenant_id = $2 AND p.author_id = $3
      ),
      all_ids AS (
        SELECT id FROM ancestors
        UNION
        SELECT id FROM subtree
      )
      SELECT id::text AS id
      FROM all_ids
      `, [pageId, tenantId, userId]);
        const restoreIds = (ids.rows || []).map((r) => String(r.id)).filter(Boolean);
        if (restoreIds.length) {
            await client.query(`UPDATE posts
         SET status = 'draft',
             deleted_at = NULL,
             metadata = (COALESCE(metadata, '{}'::jsonb) - 'category_lost'),
             updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND tenant_id = $2
           AND author_id = $3`, [restoreIds, tenantId, userId]);
        }
        // Apply chosen category to restored "roots" (top-level items in the restored set).
        // - If page is/was uncategorized, force user to choose and apply to roots.
        // - Children under a parent usually don't need category_id.
        if (requestedCategoryId) {
            const rel = await client.query(`SELECT id::text AS id, parent_id::text AS parent_id
         FROM posts
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND author_id = $3`, [restoreIds, tenantId, userId]);
            const parentMap = new Map();
            for (const r of rel.rows)
                parentMap.set(String(r.id), r.parent_id ? String(r.parent_id) : null);
            const idSet = new Set(restoreIds);
            const roots = [];
            for (const id of restoreIds) {
                const pid = parentMap.get(String(id)) || null;
                if (!pid || !idSet.has(pid))
                    roots.push(String(id));
            }
            if (roots.length) {
                await client.query(`UPDATE posts
           SET category_id = $4, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND author_id = $3`, [roots, tenantId, userId, requestedCategoryId]);
            }
        }
        await client.query("COMMIT");
        return res.json({ ok: true, restored_ids: restoreIds });
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service restoreDeletedPage error:", e);
        return res.status(500).json({ message: "Failed to restore deleted page" });
    }
    finally {
        client.release();
    }
}
// Permanently delete deleted page subtree (hard delete). This cascades to post_blocks via FK.
async function purgeDeletedPage(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const pageId = String(id || "").trim();
        if (!pageId)
            return res.status(400).json({ message: "id is required" });
        await client.query("BEGIN");
        const cur = await client.query(`SELECT id, status, deleted_at
       FROM posts
       WHERE id = $1 AND tenant_id = $2 AND author_id = $3
       FOR UPDATE`, [pageId, tenantId, userId]);
        if (cur.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Post not found" });
        }
        const row = cur.rows[0];
        if (!isDeletedRow(row)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Post is not deleted" });
        }
        const ids = await client.query(`
      WITH RECURSIVE subtree AS (
        SELECT id, parent_id
        FROM posts
        WHERE id = $1 AND tenant_id = $2 AND author_id = $3
        UNION ALL
        SELECT p.id, p.parent_id
        FROM posts p
        JOIN subtree s ON p.parent_id = s.id
        WHERE p.tenant_id = $2 AND p.author_id = $3
      )
      SELECT id::text AS id
      FROM subtree
      `, [pageId, tenantId, userId]);
        const purgeIds = (ids.rows || []).map((r) => String(r.id)).filter(Boolean);
        if (!purgeIds.length) {
            await client.query("ROLLBACK");
            return res.json({ ok: true, deleted_ids: [] });
        }
        // Only delete rows that are actually deleted (safety)
        await client.query(`DELETE FROM posts
       WHERE id = ANY($1::uuid[])
         AND tenant_id = $2
         AND author_id = $3
         AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')`, [purgeIds, tenantId, userId]);
        await client.query("COMMIT");
        return res.json({ ok: true, deleted_ids: purgeIds });
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service purgeDeletedPage error:", e);
        return res.status(500).json({ message: "Failed to purge deleted page" });
    }
    finally {
        client.release();
    }
}
/**
 * Move a page to a new position in the tree.
 * - Can change parent_id (move into another page or to root)
 * - Can reorder among siblings
 * Body: { targetParentId?: string | null, afterPageId?: string | null, beforePageId?: string | null }
 * - targetParentId: new parent (null = root level)
 * - afterPageId: place after this sibling
 * - beforePageId: place before this sibling (takes precedence if both provided)
 */
async function movePage(req, res) {
    const client = await db_1.default.connect();
    try {
        const userId = req.userId;
        const tenantId = await resolveTenantId(req);
        const { id } = req.params;
        const body = (req.body || {});
        const targetParentId = body.targetParentId === null ? null :
            typeof body.targetParentId === "string" && body.targetParentId.trim() ? body.targetParentId.trim() : undefined;
        const afterPageId = typeof body.afterPageId === "string" && body.afterPageId.trim() ? body.afterPageId.trim() : null;
        const beforePageId = typeof body.beforePageId === "string" && body.beforePageId.trim() ? body.beforePageId.trim() : null;
        await client.query("BEGIN");
        // Verify the page exists and belongs to user
        const pageRes = await client.query(`SELECT id, parent_id, category_id, page_order
       FROM posts
       WHERE id = $1 AND tenant_id = $2 AND author_id = $3 AND deleted_at IS NULL
       LIMIT 1`, [id, tenantId, userId]);
        if (pageRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Page not found" });
        }
        const page = pageRes.rows[0];
        const oldParentId = page.parent_id;
        const categoryId = page.category_id;
        // Determine new parent_id
        let newParentId = oldParentId;
        if (targetParentId !== undefined) {
            newParentId = targetParentId;
        }
        // Verify new parent exists and belongs to user (if not null)
        if (newParentId) {
            const parentRes = await client.query(`SELECT id, category_id FROM posts
         WHERE id = $1 AND tenant_id = $2 AND author_id = $3 AND deleted_at IS NULL
         LIMIT 1`, [newParentId, tenantId, userId]);
            if (parentRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid targetParentId" });
            }
            // Prevent moving a page into itself or its descendants
            // Check if newParentId is a descendant of id
            const descendantCheck = await client.query(`WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM posts WHERE id = $1 AND tenant_id = $2
           UNION ALL
           SELECT p.id, p.parent_id FROM posts p INNER JOIN ancestors a ON p.id = a.parent_id WHERE p.tenant_id = $2
         )
         SELECT id FROM ancestors WHERE id = $3`, [newParentId, tenantId, id]);
            if (descendantCheck.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Cannot move a page into itself or its descendant" });
            }
        }
        // Get current siblings at the target level (build query dynamically to avoid $ index mismatch)
        let siblingsQuery = `SELECT id, page_order FROM posts
       WHERE tenant_id = $1 AND author_id = $2 AND deleted_at IS NULL
         AND COALESCE(status, '') <> 'deleted'`;
        const siblingsParams = [tenantId, userId];
        if (newParentId) {
            siblingsQuery += ` AND parent_id = $${siblingsParams.length + 1}`;
            siblingsParams.push(newParentId);
        }
        else {
            siblingsQuery += ` AND parent_id IS NULL`;
        }
        if (categoryId) {
            siblingsQuery += ` AND category_id = $${siblingsParams.length + 1}`;
            siblingsParams.push(categoryId);
        }
        else {
            siblingsQuery += ` AND category_id IS NULL`;
        }
        siblingsQuery += ` ORDER BY page_order ASC, created_at ASC, id ASC`;
        const siblingsRes = await client.query(siblingsQuery, siblingsParams);
        const siblings = siblingsRes.rows.filter((s) => String(s.id) !== String(id));
        // Calculate new page_order
        let newPageOrder = 1;
        if (beforePageId) {
            const idx = siblings.findIndex((s) => String(s.id) === beforePageId);
            if (idx >= 0) {
                newPageOrder = idx + 1;
            }
        }
        else if (afterPageId) {
            const idx = siblings.findIndex((s) => String(s.id) === afterPageId);
            if (idx >= 0) {
                newPageOrder = idx + 2;
            }
            else {
                newPageOrder = siblings.length + 1;
            }
        }
        else {
            // No position specified, place at end
            newPageOrder = siblings.length + 1;
        }
        // Update the moved page
        await client.query(`UPDATE posts
       SET parent_id = $3, page_order = $4, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`, [id, tenantId, newParentId, newPageOrder]);
        // Reorder siblings to maintain consistent ordering
        // Insert the moved page at the correct position and renumber
        const finalOrder = [...siblings];
        finalOrder.splice(newPageOrder - 1, 0, { id, page_order: newPageOrder });
        for (let i = 0; i < finalOrder.length; i++) {
            if (String(finalOrder[i].id) === String(id))
                continue; // already updated
            if (finalOrder[i].page_order !== i + 1) {
                await client.query(`UPDATE posts SET page_order = $3 WHERE id = $1 AND tenant_id = $2`, [finalOrder[i].id, tenantId, i + 1]);
            }
        }
        // Update child_count on old and new parents
        if (oldParentId && oldParentId !== newParentId) {
            await client.query(`UPDATE posts SET child_count = GREATEST(0, child_count - 1), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`, [oldParentId, tenantId]);
        }
        if (newParentId && newParentId !== oldParentId) {
            await client.query(`UPDATE posts SET child_count = child_count + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`, [newParentId, tenantId]);
        }
        await client.query("COMMIT");
        // Return updated page info
        const updated = await (0, db_1.query)(`SELECT id, parent_id, page_order, title FROM posts WHERE id = $1`, [id]);
        return res.json(updated.rows[0] || { ok: true });
    }
    catch (e) {
        await client.query("ROLLBACK");
        console.error("post-service movePage error:", e);
        return res.status(500).json({ message: "Failed to move page" });
    }
    finally {
        client.release();
    }
}
