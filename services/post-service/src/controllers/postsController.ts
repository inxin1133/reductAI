import type { Request, Response } from "express"
import pool, { query } from "../config/db"
import { blocksToDocJson, docJsonToBlocks } from "../services/docMapping"
import type { AuthedRequest } from "../middleware/requireAuth"
import { ensureSystemTenantId } from "../services/systemTenantService"
import { randomUUID } from "crypto"

const MEDIA_ASSET_URL_RE = /(?:https?:\/\/[^/]+)?\/api\/ai\/media\/assets\/([0-9a-f-]{36})/gi

function parseIntOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? n : null
}

function slugify(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

async function assertCategoryAccess(args: {
  categoryId: string
  tenantId: string
  userId: string
}): Promise<{ id: string; category_type: string }> {
  const { categoryId, tenantId, userId } = args
  const r = await query(
    `SELECT id, category_type, COALESCE(user_id, author_id) AS owner_id
     FROM board_categories
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [categoryId, tenantId]
  )
  if (r.rows.length === 0) throw new Error("Invalid category_id")
  const row = r.rows[0] as { id: string; category_type: string; owner_id?: string | null }
  const type = String(row.category_type || "")
  if (type === "personal_page") {
    if (String(row.owner_id || "") !== String(userId)) throw new Error("Forbidden category_id")
  }
  return { id: row.id, category_type: type }
}

async function resolveTenantId(req: AuthedRequest): Promise<string> {
  const tid = req.tenantId ? String(req.tenantId) : ""
  if (tid) {
    const r = await query(`SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [tid])
    if (r.rows.length > 0) return tid
  }
  const userId = req.userId ? String(req.userId) : ""
  if (userId) {
    const r = await query(
      `
      SELECT utr.tenant_id
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      WHERE utr.user_id = $1
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
      LIMIT 1
      `,
      [userId]
    )
    if (r.rows.length > 0) return String(r.rows[0].tenant_id)
  }
  return await ensureSystemTenantId()
}

async function resolvePersonalTenantId(req: AuthedRequest): Promise<string> {
  const userId = req.userId ? String(req.userId) : ""
  if (!userId) return await resolveTenantId(req)
  const r = await query(
    `
    SELECT utr.tenant_id
    FROM user_tenant_roles utr
    JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
    WHERE utr.user_id = $1
      AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
      AND t.tenant_type = 'personal'
      AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
    ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
    LIMIT 1
    `,
    [userId]
  )
  if (r.rows.length > 0) return String(r.rows[0].tenant_id)
  return await resolveTenantId(req)
}

async function resolveCategoryContext(categoryId: string) {
  const r = await query(
    `
    SELECT id, tenant_id, category_type, COALESCE(user_id, author_id) AS owner_id
    FROM board_categories
    WHERE id = $1 AND deleted_at IS NULL
    LIMIT 1
    `,
    [categoryId]
  )
  if (r.rows.length === 0) throw new Error("Invalid category_id")
  const row = r.rows[0] as { id: string; tenant_id: string; category_type: string; owner_id?: string | null }
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    categoryType: String(row.category_type || ""),
    ownerId: row.owner_id ? String(row.owner_id) : "",
  }
}

async function resolveTenantIdForCategoryType(req: AuthedRequest, categoryType: string) {
  if (categoryType === "team_page") return await resolveTenantId(req)
  return await resolvePersonalTenantId(req)
}

async function tenantAllowsSharedPages(tenantId: string): Promise<boolean> {
  const r = await query(`SELECT tenant_type FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [tenantId])
  const tt = String(r.rows[0]?.tenant_type || "")
  // User request: Team + Group both should show "팀 페이지" section (exclude Personal)
  return tt !== "personal"
}

async function getPostMetaVersion(postId: string): Promise<number> {
  const r = await query(`SELECT COALESCE((metadata->>'doc_version')::int, 0) AS v FROM posts WHERE id = $1`, [
    postId,
  ])
  if (r.rows.length === 0) return 0
  return Number(r.rows[0]?.v || 0)
}

function extractMediaAssetIdsFromDocJson(docJson: unknown): string[] {
  const found = new Set<string>()
  const visit = (val: unknown) => {
    if (val == null) return
    if (typeof val === "string") {
      for (const m of val.matchAll(MEDIA_ASSET_URL_RE)) {
        const id = m[1]
        if (id) found.add(id)
      }
      return
    }
    if (Array.isArray(val)) {
      for (const item of val) visit(item)
      return
    }
    if (typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) visit(v)
    }
  }
  visit(docJson)
  return Array.from(found)
}

export async function getPostContent(req: Request, res: Response) {
  try {
    const { id } = req.params
    const version = await getPostMetaVersion(id)

    const p = await query(
      `SELECT id, title, icon, category_id, status, deleted_at
       FROM posts
       WHERE id = $1
       LIMIT 1`,
      [id]
    )
    if (p.rows.length === 0) return res.status(404).json({ message: "Post not found" })

    const r = await query(
      `SELECT id, post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id
       FROM post_blocks
       WHERE post_id = $1 AND parent_block_id IS NULL AND is_deleted = FALSE
       ORDER BY sort_key ASC`,
      [id]
    )

    const docJson = blocksToDocJson(r.rows as any)
    const row = p.rows[0]
    return res.json({
      docJson,
      version,
      title: row.title,
      icon: row.icon ?? null,
      category_id: row.category_id ?? null,
      status: row.status,
      deleted_at: row.deleted_at,
    })
  } catch (e) {
    console.error("post-service getPostContent error:", e)
    return res.status(500).json({ message: "Failed to load post content" })
  }
}

export async function savePostContent(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const userId = (req as AuthedRequest).userId
    const tenantId = await resolveTenantId(req as AuthedRequest)
    const body = req.body as { docJson?: any; version?: number; pmSchemaVersion?: number }

    if (!body?.docJson || typeof body.docJson !== "object") {
      return res.status(400).json({ message: "docJson is required" })
    }

    const requestedVersion = parseIntOrNull(body.version)
    const pmSchemaVersion = typeof body.pmSchemaVersion === "number" ? body.pmSchemaVersion : 1

    await client.query("BEGIN")

    const postRow = await client.query(
      `SELECT id, author_id, metadata
       FROM posts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    )
    if (postRow.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Post not found" })
    }

    const cur = Number(postRow.rows[0]?.metadata?.doc_version ?? 0) || 0

    if (requestedVersion !== null && requestedVersion !== cur) {
      await client.query("ROLLBACK")
      return res.status(409).json({
        message: "Version conflict",
        currentVersion: cur,
      })
    }

    // If embed blocks were removed, mark the corresponding child pages as deleted.
    // We only delete pages that are true children (posts.parent_id = this post id) and owned by the same user.
    const prevBlocks = await client.query(
      `SELECT ref_post_id, content
       FROM post_blocks
       WHERE post_id = $1 AND block_type = 'page_link'`,
      [id]
    )
    const prevEmbedIds = new Set<string>()
    for (const row of prevBlocks.rows as Array<{ ref_post_id?: string | null; content?: any }>) {
      const pid = typeof row.ref_post_id === "string" ? row.ref_post_id : null
      if (!pid) continue
      const pm = row.content?.pm || row.content
      const display = pm?.attrs?.display
      if (display === "embed") prevEmbedIds.add(pid)
    }

    // Replace-all strategy for MVP: delete existing blocks and re-insert from docJson.
    await client.query(`DELETE FROM post_blocks WHERE post_id = $1`, [id])

    const blocks = docJsonToBlocks({ postId: id, docJson: body.docJson, pmSchemaVersion })

    const rawAssetIds = extractMediaAssetIdsFromDocJson(body.docJson)
    const assetIds = Array.from(new Set(rawAssetIds.map(String))).filter((v) => isUuid(v))

    // Maintain file_asset_post_links with stable created_at:
    // - Delete only removed links
    // - Upsert current links (preserve created_at for existing)
    const existingLinksRes = await client.query(`SELECT asset_id FROM file_asset_post_links WHERE post_id = $1`, [id])
    const existingAssetIds = (existingLinksRes.rows || [])
      .map((r: any) => String(r?.asset_id || ""))
      .filter((v) => isUuid(v))
    const desiredSet = new Set(assetIds)
    const toRemove = existingAssetIds.filter((aid) => !desiredSet.has(aid))
    if (toRemove.length) {
      await client.query(`DELETE FROM file_asset_post_links WHERE post_id = $1 AND asset_id = ANY($2::uuid[])`, [id, toRemove])
    }

    if (assetIds.length) {
      const metaRes = await client.query(
        `
        SELECT bc.category_type, COALESCE(bc.user_id, bc.author_id) AS owner_id
        FROM posts p
        LEFT JOIN board_categories bc ON bc.id = p.category_id
        WHERE p.id = $1
        LIMIT 1
        `,
        [id]
      )
      const categoryType = String(metaRes.rows?.[0]?.category_type || "")
      const scopeType = categoryType === "team_page" ? "team_page" : "personal_page"
      const ownerId = String(metaRes.rows?.[0]?.owner_id || userId || "")
      await client.query(
        `
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
        `,
        [assetIds, scopeType, ownerId, tenantId, id]
      )
      const ownerForLink = scopeType === "personal_page" ? ownerId : null
      const tenantForLink = scopeType === "team_page" ? tenantId : null
      await client.query(
        `
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
        `,
        [assetIds, id, scopeType, ownerForLink, tenantForLink]
      )
    }

    // Guard against invalid page_link refs (missing posts) to avoid FK errors.
    const refIds = Array.from(
      new Set(
        blocks
          .map((b) => (typeof b.ref_post_id === "string" ? b.ref_post_id : null))
          .filter((v): v is string => Boolean(v))
      )
    )
    const validRefIds = new Set<string>()
    if (refIds.length) {
      const refRes = await client.query(`SELECT id FROM posts WHERE id = ANY($1::uuid[])`, [refIds])
      for (const row of refRes.rows as Array<{ id: string }>) {
        validRefIds.add(String(row.id))
      }
    }

    const nextEmbedIds = new Set<string>()
    for (const b of blocks) {
      if (b.block_type !== "page_link") continue
      const pm = b.content?.pm || b.content
      const display = pm?.attrs?.display
      const pid = typeof b.ref_post_id === "string" ? b.ref_post_id : null
      if (display === "embed" && pid && validRefIds.has(pid)) nextEmbedIds.add(pid)
    }

    for (const b of blocks) {
      const refId = typeof b.ref_post_id === "string" ? b.ref_post_id : null
      if (refId && !validRefIds.has(refId)) {
        continue
      }
      await client.query(
        `INSERT INTO post_blocks (
           post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id,
           is_deleted, pm_schema_version
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9)`,
        [
          id,
          b.parent_block_id,
          b.block_type,
          b.sort_key,
          b.content,
          b.content_text,
          b.ref_post_id,
          b.external_embed_id,
          pmSchemaVersion,
        ]
      )
    }

    // Mark removed embeds' pages as deleted.
    const removed: string[] = []
    for (const pid of prevEmbedIds) {
      if (!nextEmbedIds.has(pid)) removed.push(pid)
    }
    if (removed.length) {
      await client.query(
        `UPDATE posts
         SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND parent_id = $2
           AND author_id = $3
           AND deleted_at IS NULL`,
        [removed, id, userId]
      )
    }

    // If embeds were re-added (undo), restore those child pages.
    const restoreIds = Array.from(nextEmbedIds)
    if (restoreIds.length) {
      await client.query(
        `UPDATE posts
         SET status = 'draft', deleted_at = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND parent_id = $2
           AND author_id = $3
           AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')`,
        [restoreIds, id, userId]
      )
    }

    // Keep children ordering in sync with the embed order inside this parent page.
    // Topmost embed block => smallest page_order (appears first in tree).
    const embedOrder: string[] = []
    const embedSeen = new Set<string>()
    for (const b of blocks) {
      if (b.block_type !== "page_link") continue
      const pm = b.content?.pm || b.content
      const display = pm?.attrs?.display
      const pid = typeof b.ref_post_id === "string" ? b.ref_post_id : null
      if (display === "embed" && pid && !embedSeen.has(pid)) {
        embedSeen.add(pid)
        embedOrder.push(pid)
      }
    }
    if (embedOrder.length) {
      const ords = embedOrder.map((_, i) => i + 1)
      await client.query(
        `WITH ord AS (
           SELECT *
           FROM unnest($1::uuid[], $2::int[]) AS t(id, ord)
         )
         UPDATE posts p
         SET page_order = ord.ord
         FROM ord
         WHERE p.id = ord.id
           AND p.parent_id = $3
           AND p.author_id = $4`,
        [embedOrder, ords, id, userId]
      )
    }

    const nextVersion = cur + 1
    await client.query(
      `UPDATE posts
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{doc_version}', to_jsonb($2::int), true)
       WHERE id = $1`,
      [id, nextVersion]
    )

    await client.query("COMMIT")
    return res.json({ ok: true, version: nextVersion })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service savePostContent error:", e)
    return res.status(500).json({ message: "Failed to save post content" })
  } finally {
    client.release()
  }
}

export async function createPost(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const body = (req.body || {}) as any

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled"
    const pageType = typeof body.page_type === "string" ? body.page_type : "page"
    const visibility = typeof body.visibility === "string" ? body.visibility : "private"
    const status = typeof body.status === "string" ? body.status : "draft"
    const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null
    const categoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null

    // slug must be unique within (tenant_id,parent_id)
    const slug = `page-${randomUUID().slice(0, 8)}`

    await client.query("BEGIN")

    let tenantId = ""
    let effectiveCategoryId = categoryId

    // Validate parent_id (must exist and be owned by same user) if provided
    // Also inherit parent's category_id if none provided explicitly
    if (parentId) {
      const p = await client.query(
        `SELECT id, category_id, tenant_id
         FROM posts
         WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [parentId, userId]
      )
      if (p.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ message: "Invalid parent_id" })
      }
      const parentRow = p.rows[0] as { category_id?: string | null; tenant_id?: string | null }
      if (parentRow?.tenant_id) {
        tenantId = String(parentRow.tenant_id)
      }
      // Inherit parent's category_id if child doesn't specify one
      if (!effectiveCategoryId && p.rows[0].category_id) {
        effectiveCategoryId = p.rows[0].category_id
      }
    }

    if (!tenantId && effectiveCategoryId) {
      const ctx = await resolveCategoryContext(effectiveCategoryId)
      if (ctx.categoryType === "personal_page" && String(ctx.ownerId || "") !== String(userId)) {
        await client.query("ROLLBACK")
        return res.status(403).json({ message: "Forbidden" })
      }
      tenantId = ctx.tenantId
    }
    if (!tenantId) {
      tenantId = await resolvePersonalTenantId(req as AuthedRequest)
    }

    // Validate category if provided (or inherited)
    if (effectiveCategoryId) {
      await assertCategoryAccess({ categoryId: effectiveCategoryId, tenantId, userId })
    }

    const r = await client.query(
      `INSERT INTO posts (
         tenant_id, parent_id, category_id, author_id, title, slug, page_type, status, visibility, metadata
       )
       VALUES ($1,$9,$10,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id, parent_id, title, slug, created_at, updated_at`,
      [tenantId, userId, title, slug, pageType, status, visibility, JSON.stringify({ doc_version: 0 }), parentId, effectiveCategoryId]
    )
    await client.query("COMMIT")
    return res.status(201).json(r.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service createPost error:", e)
    return res.status(500).json({ message: "Failed to create post" })
  } finally {
    client.release()
  }
}

export async function listMyPages(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const categoryId = typeof req.query.categoryId === "string" ? String(req.query.categoryId).trim() : ""
    let tenantId = ""
    if (categoryId) {
      const ctx = await resolveCategoryContext(categoryId)
      if (ctx.categoryType === "personal_page" && String(ctx.ownerId || "") !== String(userId)) {
        return res.status(403).json({ message: "Forbidden" })
      }
      if (ctx.categoryType === "team_page") {
        const ok = await tenantAllowsSharedPages(ctx.tenantId)
        if (!ok) return res.json([])
      }
      tenantId = ctx.tenantId
    }
    if (!tenantId) {
      tenantId = await resolvePersonalTenantId(req as AuthedRequest)
    }

    let sql =
      `SELECT id, parent_id, category_id, title, icon, slug, page_type, status, visibility, child_count, page_order, updated_at
       FROM posts
       WHERE tenant_id = $1 AND author_id = $2 AND deleted_at IS NULL AND COALESCE(status, '') <> 'deleted'`
    const params: any[] = [tenantId, userId]
    if (categoryId) {
      if (categoryId === "null") {
        sql += ` AND category_id IS NULL`
      } else {
        sql += ` AND category_id = $3`
        params.push(categoryId)
      }
    }
    sql += `
       -- IMPORTANT: keep ordering stable; opening/saving a page updates updated_at and should NOT reshuffle the tree.
       ORDER BY parent_id NULLS FIRST, page_order ASC, created_at DESC, id DESC`

    const r = await query(sql, params)
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listMyPages error:", e)
    return res.status(500).json({ message: "Failed to list pages" })
  }
}

// Personal page categories (for Sidebar grouping)
export async function listMyPageCategories(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const type = typeof req.query.type === "string" ? String(req.query.type) : "personal_page"
    const categoryType = type === "team_page" ? "team_page" : "personal_page"
    const tenantId = await resolveTenantIdForCategoryType(req as AuthedRequest, categoryType)

    // Shared/Team categories exist when the current tenant is NOT personal (team + group).
    if (categoryType === "team_page") {
      const ok = await tenantAllowsSharedPages(tenantId)
      if (!ok) return res.json([])
    }

    await client.query("BEGIN")
    // Prevent duplicate default category creation under concurrent requests.
    const lockKey =
      categoryType === "team_page"
        ? `default-category:team:${tenantId}`
        : `default-category:personal:${tenantId}:${userId}`
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey])

    // Ensure default category exists ONLY once:
    // - Create when there has never been any category row for this scope (including deleted rows).
    // - If user deletes all categories (soft delete), we do NOT recreate.
    const defaultName = categoryType === "team_page" ? "공유 페이지" : "나의 페이지"
    const anyEver = await client.query(
      `SELECT 1
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
       LIMIT 1`,
      [tenantId, userId, categoryType]
    )
    const existsActive = await client.query(
      `SELECT 1
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
         AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId, userId, categoryType]
    )
    if (anyEver.rows.length === 0 && existsActive.rows.length === 0) {
      const base = slugify(defaultName) || "category"
      const slug = `${base}-${randomUUID().slice(0, 8)}`
      const maxR = await client.query(
        `SELECT COALESCE(MAX(display_order), 0) AS m
         FROM board_categories
         WHERE tenant_id = $1 AND category_type = $3 AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2) AND deleted_at IS NULL`,
        [tenantId, userId, categoryType]
      )
      const nextOrder = Number(maxR.rows[0]?.m || 0) + 1
      await client.query(
        `INSERT INTO board_categories (tenant_id, author_id, user_id, category_type, parent_id, name, slug, icon, display_order, is_active, metadata)
         VALUES ($1, $2, $2, $3, NULL, $4, $5, NULL, $6, TRUE, '{}'::jsonb)`,
        [tenantId, userId, categoryType, defaultName, slug, nextOrder]
      )
    }

    const r = await client.query(
      `SELECT id, parent_id, name, slug, icon, display_order, created_at, updated_at
       FROM board_categories
       WHERE tenant_id = $1
         AND category_type = $3
         AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2)
         AND deleted_at IS NULL
       ORDER BY display_order ASC, created_at ASC, id ASC`,
      [tenantId, userId, categoryType]
    )
    await client.query("COMMIT")
    return res.json(r.rows)
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service listMyPageCategories error:", e)
    return res.status(500).json({ message: "Failed to list categories" })
  } finally {
    client.release()
  }
}

export async function createMyPageCategory(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const body = (req.body || {}) as { name?: unknown; icon?: unknown; type?: unknown }
    const type = typeof body.type === "string" ? body.type : "personal_page"
    const categoryType = type === "team_page" ? "team_page" : "personal_page"
    const tenantId = await resolveTenantIdForCategoryType(req as AuthedRequest, categoryType)
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New category"
    const icon = typeof body.icon === "string" ? body.icon.trim().slice(0, 100) : null

    if (categoryType === "team_page") {
      const ok = await tenantAllowsSharedPages(tenantId)
      if (!ok) return res.status(400).json({ message: "Shared categories require a non-personal tenant" })
    }

    const base = slugify(name) || "category"
    const slug = `${base}-${randomUUID().slice(0, 8)}`

    await client.query("BEGIN")
    const maxR = await client.query(
      `SELECT COALESCE(MAX(display_order), 0) AS m
       FROM board_categories
       WHERE tenant_id = $1 AND category_type = $3 AND ($3 <> 'personal_page' OR COALESCE(user_id, author_id) = $2) AND deleted_at IS NULL`,
      [tenantId, userId, categoryType]
    )
    const nextOrder = Number(maxR.rows[0]?.m || 0) + 1

    const ins = await client.query(
      `INSERT INTO board_categories (tenant_id, author_id, user_id, category_type, parent_id, name, slug, icon, display_order, is_active, metadata)
       VALUES ($1, $2, $2, $3, NULL, $4, $5, $6, $7, TRUE, '{}'::jsonb)
       RETURNING id, parent_id, name, slug, icon, display_order, created_at, updated_at`,
      [tenantId, userId, categoryType, name, slug, icon, nextOrder]
    )
    await client.query("COMMIT")
    return res.status(201).json(ins.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service createMyPageCategory error:", e)
    return res.status(500).json({ message: "Failed to create category" })
  } finally {
    client.release()
  }
}

export async function updateCategory(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const body = (req.body || {}) as any

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const iconProvided = "icon" in body
    const iconRaw = iconProvided ? body.icon : undefined
    const icon = typeof iconRaw === "string" ? iconRaw.trim().slice(0, 100) : iconRaw === null ? null : undefined
    const displayOrder = typeof body.display_order === "number" ? body.display_order : null

    if (!name && icon === undefined && displayOrder === null) {
      return res.status(400).json({ message: "name, icon or display_order is required" })
    }

    // Ensure category exists & ownership rules (personal_page requires author match)
    const cur = await query(
      `SELECT id, tenant_id, category_type, COALESCE(user_id, author_id) AS owner_id
       FROM board_categories
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    )
    if (cur.rows.length === 0) return res.status(404).json({ message: "Category not found" })
    const row = cur.rows[0] as { tenant_id: string; category_type: string; owner_id?: string | null }
    const tenantId = String(row.tenant_id)
    if (String(row.category_type) === "personal_page" && String(row.owner_id || "") !== String(userId)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    const sets: string[] = []
    const vals: any[] = [id, tenantId]
    let idx = 3
    if (name) {
      sets.push(`name = $${idx}`)
      vals.push(name)
      idx += 1
    }
    if (icon !== undefined) {
      sets.push(`icon = $${idx}`)
      vals.push(icon)
      idx += 1
    }
    if (displayOrder !== null) {
      sets.push(`display_order = $${idx}`)
      vals.push(displayOrder)
      idx += 1
    }
    sets.push(`updated_at = NOW()`)

    await client.query("BEGIN")
    const r = await client.query(
      `UPDATE board_categories
       SET ${sets.join(", ")}
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, parent_id, name, slug, icon, display_order, updated_at`,
      vals
    )
    await client.query("COMMIT")
    return res.json(r.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service updateCategory error:", e)
    return res.status(500).json({ message: "Failed to update category" })
  } finally {
    client.release()
  }
}

export async function deleteCategory(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params

    const cur = await client.query(
      `SELECT id, tenant_id, category_type, COALESCE(user_id, author_id) AS owner_id
       FROM board_categories
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    )
    if (cur.rows.length === 0) return res.status(404).json({ message: "Category not found" })
    const row = cur.rows[0] as { tenant_id: string; category_type: string; owner_id?: string | null }
    const tenantId = String(row.tenant_id)
    if (String(row.category_type) === "personal_page" && String(row.owner_id || "") !== String(userId)) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // Can delete ONLY when all pages in this category are already deleted.
    const alive = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM posts
       WHERE category_id = $1
         AND deleted_at IS NULL
         AND COALESCE(status, '') <> 'deleted'`,
      [id]
    )
    const c = Number(alive.rows[0]?.c || 0)
    if (c > 0) {
      return res.status(400).json({ message: "Category can be deleted only when all pages are deleted" })
    }

    await client.query("BEGIN")

    // Mark deleted posts in this category so Trash UI can warn "restores to uncategorized".
    await client.query(
      `
      UPDATE posts
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{category_lost}', 'true'::jsonb, true),
          updated_at = NOW()
      WHERE tenant_id = $1
        AND author_id = $2
        AND category_id = $3
        AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')
      `,
      [tenantId, userId, id]
    )

    // Hard delete category. FK on posts.category_id is ON DELETE SET NULL, so posts won't break.
    await client.query(`DELETE FROM board_categories WHERE id = $1 AND tenant_id = $2`, [id, tenantId])

    // Cleanup any previously soft-deleted categories (best-effort, keeps DB tidy).
    await client.query(`DELETE FROM board_categories WHERE deleted_at IS NOT NULL AND tenant_id = $1`, [tenantId]).catch(() => null)

    await client.query("COMMIT")
    return res.json({ ok: true })
  } catch (e) {
    await client.query("ROLLBACK").catch(() => null)
    console.error("post-service deleteCategory error:", e)
    return res.status(500).json({ message: "Failed to delete category" })
  } finally {
    client.release()
  }
}

export async function reorderCategories(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const body = (req.body || {}) as any
    const type = typeof body.type === "string" ? body.type : "personal_page"
    const categoryType = type === "team_page" ? "team_page" : "personal_page"
    const tenantId = await resolveTenantIdForCategoryType(req as AuthedRequest, categoryType)
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String).filter(Boolean) : []
    if (!orderedIds.length) return res.status(400).json({ message: "orderedIds is required" })

    await client.query("BEGIN")
    // ownership check for personal
    if (categoryType === "personal_page") {
      const owned = await client.query(
        `SELECT id FROM board_categories
         WHERE tenant_id = $1 AND category_type = 'personal_page' AND COALESCE(user_id, author_id) = $2 AND deleted_at IS NULL`,
        [tenantId, userId]
      )
      const set = new Set((owned.rows || []).map((r: any) => String(r.id)))
      for (const id of orderedIds) if (!set.has(String(id))) throw new Error("Forbidden reorder")
    }
    for (let i = 0; i < orderedIds.length; i += 1) {
      await client.query(
        `UPDATE board_categories
         SET display_order = $4, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND category_type = $3 AND deleted_at IS NULL`,
        [orderedIds[i], tenantId, categoryType, i + 1]
      )
    }
    await client.query("COMMIT")
    return res.json({ ok: true })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service reorderCategories error:", e)
    return res.status(500).json({ message: "Failed to reorder categories" })
  } finally {
    client.release()
  }
}

export async function getCurrentTenant(req: Request, res: Response) {
  try {
    const tenantId = await resolveTenantId(req as AuthedRequest)
    const r = await query(
      `
      SELECT
        id,
        name,
        tenant_type,
        COALESCE(
          NULLIF(metadata->>'plan_tier',''),
          NULLIF(metadata->>'service_tier',''),
          NULLIF(metadata->>'tier','')
        ) AS plan_tier
      FROM tenants
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [tenantId]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Tenant not found" })
    return res.json({
      id: r.rows[0].id,
      name: r.rows[0].name,
      tenant_type: r.rows[0].tenant_type,
      plan_tier: r.rows[0].plan_tier,
    })
  } catch (e) {
    console.error("post-service getCurrentTenant error:", e)
    return res.status(500).json({ message: "Failed to load tenant" })
  }
}

export async function listTenantMemberships(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const r = await query(
      `
      SELECT
        t.id,
        t.name,
        t.tenant_type,
        COALESCE(utr.membership_status, 'active') AS membership_status,
        utr.joined_at,
        utr.expires_at,
        COALESCE(utr.is_primary_tenant, FALSE) AS is_primary,
        r.slug AS role_slug,
        r.name AS role_name,
        r.scope AS role_scope,
        COALESCE(mc.member_count, 0) AS member_count,
        COALESCE(
          NULLIF(t.metadata->>'plan_tier',''),
          NULLIF(t.metadata->>'service_tier',''),
          NULLIF(t.metadata->>'tier','')
        ) AS plan_tier
      FROM user_tenant_roles utr
      JOIN tenants t ON t.id = utr.tenant_id AND t.deleted_at IS NULL
      LEFT JOIN roles r ON r.id = utr.role_id
      LEFT JOIN (
        SELECT
          utr2.tenant_id,
          COUNT(DISTINCT utr2.user_id) AS member_count
        FROM user_tenant_roles utr2
        JOIN roles r2 ON r2.id = utr2.role_id
        WHERE (utr2.membership_status IS NULL OR utr2.membership_status = 'active')
          AND r2.slug IN ('owner', 'admin', 'member')
        GROUP BY utr2.tenant_id
      ) mc ON mc.tenant_id = t.id
      WHERE utr.user_id = $1
        AND COALESCE((t.metadata->>'system')::boolean, FALSE) = FALSE
      ORDER BY COALESCE(utr.is_primary_tenant, FALSE) DESC, utr.joined_at ASC, utr.granted_at ASC
      `,
      [userId]
    )
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listTenantMemberships error:", e)
    return res.status(500).json({ message: "Failed to load tenant memberships" })
  }
}

export async function listCurrentUserProviders(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const r = await query(
      `
      SELECT
        id,
        provider,
        provider_user_id,
        extra_data,
        created_at
      FROM user_providers
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    )
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listCurrentUserProviders error:", e)
    return res.status(500).json({ message: "Failed to load providers" })
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const r = await query(
      `
      SELECT
        id,
        email,
        full_name,
        metadata->>'profile_image_asset_id' AS profile_image_asset_id
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [userId]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "User not found" })
    const row = r.rows[0] as {
      id: string
      email: string
      full_name?: string | null
      profile_image_asset_id?: string | null
    }
    const profileImageAssetId = row.profile_image_asset_id ? String(row.profile_image_asset_id) : null
    return res.json({
      id: row.id,
      email: row.email,
      full_name: row.full_name ?? null,
      profile_image_asset_id: profileImageAssetId,
      profile_image_url: profileImageAssetId ? `/api/ai/media/assets/${profileImageAssetId}` : null,
    })
  } catch (e) {
    console.error("post-service getCurrentUser error:", e)
    return res.status(500).json({ message: "Failed to load user" })
  }
}

export async function updateCurrentUser(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const body = (req.body || {}) as Record<string, unknown>
    const fullNameRaw = body?.full_name
    const fullName = typeof fullNameRaw === "string" ? fullNameRaw.trim() : ""
    const profileImageRaw = body?.profile_image_asset_id
    let profileImageAssetId: string | null | undefined = undefined
    if (profileImageRaw === null) {
      profileImageAssetId = null
    } else if (typeof profileImageRaw === "string") {
      const cleaned = profileImageRaw.trim()
      profileImageAssetId = cleaned ? cleaned : null
    }

    if (!fullName && profileImageAssetId === undefined) {
      return res.status(400).json({ message: "No changes provided" })
    }

    if (profileImageAssetId !== undefined && profileImageAssetId !== null && !isUuid(profileImageAssetId)) {
      return res.status(400).json({ message: "Invalid profile_image_asset_id" })
    }

    const fields: string[] = []
    const params: any[] = []

    if (fullName) {
      params.push(fullName)
      fields.push(`full_name = $${params.length}`)
    }

    if (profileImageAssetId !== undefined) {
      if (profileImageAssetId === null) {
        fields.push(`metadata = (COALESCE(metadata, '{}'::jsonb) - 'profile_image_asset_id')`)
      } else {
        params.push(profileImageAssetId)
        fields.push(
          `metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{profile_image_asset_id}', to_jsonb($${params.length}::text), true)`
        )
      }
    }

    fields.push(`updated_at = NOW()`)
    params.push(userId)

    const r = await query(
      `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING id, email, full_name, metadata->>'profile_image_asset_id' AS profile_image_asset_id
      `,
      params
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "User not found" })
    const row = r.rows[0] as {
      id: string
      email: string
      full_name?: string | null
      profile_image_asset_id?: string | null
    }
    const profileImageId = row.profile_image_asset_id ? String(row.profile_image_asset_id) : null
    return res.json({
      id: row.id,
      email: row.email,
      full_name: row.full_name ?? null,
      profile_image_asset_id: profileImageId,
      profile_image_url: profileImageId ? `/api/ai/media/assets/${profileImageId}` : null,
    })
  } catch (e) {
    console.error("post-service updateCurrentUser error:", e)
    return res.status(500).json({ message: "Failed to update user" })
  }
}

export async function updateTenantName(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const tenantId = String(req.params.id || "").trim()
    const nameRaw = (req.body || {})?.name
    const nextName = typeof nameRaw === "string" ? nameRaw.trim() : ""
    if (!tenantId || !isUuid(tenantId)) return res.status(400).json({ message: "Invalid tenant id" })
    if (!nextName) return res.status(400).json({ message: "name is required" })

    const roleRes = await query(
      `
      SELECT r.slug
      FROM user_tenant_roles utr
      JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = $1
        AND utr.tenant_id = $2
        AND (utr.membership_status IS NULL OR utr.membership_status = 'active')
      ORDER BY utr.granted_at DESC NULLS LAST
      LIMIT 1
      `,
      [userId, tenantId]
    )
    const roleSlug = String(roleRes.rows?.[0]?.slug || "").toLowerCase()
    const canManage = roleSlug === "owner" || roleSlug === "admin" || roleSlug === "tenant_owner" || roleSlug === "tenant_admin"
    if (!canManage) return res.status(403).json({ message: "Forbidden" })

    const r = await query(
      `UPDATE tenants SET name = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING id, name, tenant_type`,
      [nextName, tenantId]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Tenant not found" })
    return res.json(r.rows[0])
  } catch (e) {
    console.error("post-service updateTenantName error:", e)
    return res.status(500).json({ message: "Failed to update tenant" })
  }
}

export async function updatePostCategory(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const body = (req.body || {}) as any
    const categoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null

    const cur = await client.query(
      `SELECT id, tenant_id
       FROM posts
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId]
    )
    if (cur.rows.length === 0) return res.status(404).json({ message: "Post not found" })
    const tenantId = String(cur.rows[0].tenant_id)

    if (categoryId) {
      const ctx = await resolveCategoryContext(categoryId)
      if (String(ctx.tenantId) !== String(tenantId)) {
        return res.status(400).json({ message: "Category belongs to a different tenant" })
      }
      if (ctx.categoryType === "personal_page" && String(ctx.ownerId || "") !== String(userId)) {
        return res.status(403).json({ message: "Forbidden" })
      }
      if (ctx.categoryType === "team_page") {
        const ok = await tenantAllowsSharedPages(tenantId)
        if (!ok) return res.status(400).json({ message: "Shared categories require a non-personal tenant" })
      }
      await assertCategoryAccess({ categoryId, tenantId, userId })
    }

    const r = await client.query(
      `UPDATE posts
       SET category_id = $3, updated_at = NOW()
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id, category_id`,
      [id, userId, categoryId]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Post not found" })
    return res.json(r.rows[0])
  } catch (e) {
    console.error("post-service updatePostCategory error:", e)
    return res.status(500).json({ message: "Failed to update post category" })
  } finally {
    client.release()
  }
}

export async function getPostPreview(req: Request, res: Response) {
  try {
    const { id } = req.params
    const p = await query(
      `SELECT id, title, icon, excerpt, updated_at, category_id
       FROM posts
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [id]
    )
    if (p.rows.length === 0) return res.status(404).json({ message: "Post not found" })

    const row = p.rows[0]

    let summary = typeof row.excerpt === "string" ? row.excerpt : ""
    if (!summary) {
      const blocks = await query(
        `SELECT content_text
         FROM post_blocks
         WHERE post_id = $1 AND is_deleted = FALSE
         ORDER BY sort_key ASC
         LIMIT 5`,
        [id]
      )
      summary = (blocks.rows || [])
        .map((b: any) => (typeof b.content_text === "string" ? b.content_text : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    }
    if (summary.length > 140) summary = summary.slice(0, 140) + "…"

    return res.json({
      id: row.id,
      title: row.title,
      icon: row.icon ?? null,
      summary,
      updated_at: row.updated_at,
      category_id: row.category_id ?? null,
    })
  } catch (e) {
    console.error("post-service getPostPreview error:", e)
    return res.status(500).json({ message: "Failed to load preview" })
  }
}

export async function updatePost(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const body = (req.body || {}) as any

    const title = typeof body.title === "string" ? body.title.trim() : ""
    const status = typeof body.status === "string" ? body.status.trim() : ""
    const iconProvided = "icon" in body
    const iconRaw = iconProvided ? body.icon : undefined
    const icon =
      typeof iconRaw === "string"
        ? iconRaw.trim() || null
        : iconRaw === null
          ? null
          : undefined

    if (!title && !status && icon === undefined) return res.status(400).json({ message: "title, status or icon is required" })
    if (typeof icon === "string" && icon.length > 100) return res.status(400).json({ message: "icon is too long" })

    const updates: string[] = []
    const values: any[] = [id, userId]
    let idx = 3

    if (title) {
      updates.push(`title = $${idx}`)
      values.push(title)
      idx += 1
    }
    if (status) {
      // MVP: support "deleted" (trash) and "draft" (restore)
      if (status !== "deleted" && status !== "draft") return res.status(400).json({ message: "invalid status" })
      updates.push(`status = $${idx}`)
      values.push(status)
      idx += 1
      if (status === "deleted") updates.push(`deleted_at = NOW()`)
      if (status === "draft") updates.push(`deleted_at = NULL`)
    }
    if (icon !== undefined) {
      updates.push(`icon = $${idx}`)
      values.push(icon)
      idx += 1
    }
    updates.push(`updated_at = NOW()`)

    const r = await client.query(
      `UPDATE posts
       SET ${updates.join(", ")}
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id, parent_id, title, icon, status, deleted_at, updated_at`,
      values
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Post not found" })
    return res.json(r.rows[0])
  } catch (e) {
    console.error("post-service updatePost error:", e)
    return res.status(500).json({ message: "Failed to update post" })
  } finally {
    client.release()
  }
}

function isDeletedRow(row: { deleted_at?: unknown; status?: unknown }) {
  const deletedAt = row && (row as any).deleted_at
  const status = row && (row as any).status
  return Boolean(deletedAt) || String(status || "").trim() === "deleted"
}

// --- Trash (deleted posts) ---
// List deleted pages (roots only). Children appear inside the deleted parent's detail view.
export async function listDeletedPages(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const tenantId = await resolveTenantId(req as AuthedRequest)

    const r = await query(
      `
      SELECT
        p.id,
        p.parent_id,
        p.title,
        p.icon,
        p.category_id,
        (COALESCE(p.metadata->>'category_lost','false')::boolean) AS category_lost,
        p.deleted_at,
        p.updated_at,
        (
          SELECT COUNT(*)::int
          FROM posts child
          WHERE child.parent_id = p.id
            AND child.tenant_id = $1
            AND child.author_id = $2
            AND (child.deleted_at IS NOT NULL OR COALESCE(child.status,'') = 'deleted')
        ) AS child_count
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
      `,
      [tenantId, userId]
    )

    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listDeletedPages error:", e)
    return res.status(500).json({ message: "Failed to list deleted pages" })
  }
}

// Deleted page detail: content + breadcrumb (ancestors) + deleted children
export async function getDeletedPageDetail(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const pageId = String(id || "").trim()
    if (!pageId) return res.status(400).json({ message: "id is required" })

    const p = await query(
      `SELECT id, tenant_id, parent_id, title, icon, category_id, metadata, status, deleted_at, updated_at
       FROM posts
       WHERE id = $1 AND author_id = $2
       LIMIT 1`,
      [pageId, userId]
    )
    if (p.rows.length === 0) return res.status(404).json({ message: "Post not found" })
    const row = p.rows[0] as any
    const tenantId = String(row.tenant_id)
    if (!isDeletedRow(row)) return res.status(400).json({ message: "Post is not deleted" })

    // content (reuse the same mapping as getPostContent)
    const version = await getPostMetaVersion(pageId)
    const blocks = await query(
      `SELECT id, post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id
       FROM post_blocks
       WHERE post_id = $1 AND parent_block_id IS NULL AND is_deleted = FALSE
       ORDER BY sort_key ASC`,
      [pageId]
    )
    const docJson = blocksToDocJson(blocks.rows as any)

    // ancestors chain (for breadcrumb)
    const ancestors = await query(
      `
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
      `,
      [pageId, tenantId, userId]
    )

    // deleted children only (direct)
    const children = await query(
      `
      SELECT id, parent_id, title, icon, status, deleted_at, updated_at
      FROM posts
      WHERE tenant_id = $1
        AND author_id = $2
        AND parent_id = $3
        AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')
      ORDER BY page_order ASC, created_at ASC, id ASC
      `,
      [tenantId, userId, pageId]
    )

    return res.json({
      post: row,
      docJson,
      version,
      ancestors: ancestors.rows,
      children: children.rows,
    })
  } catch (e) {
    console.error("post-service getDeletedPageDetail error:", e)
    return res.status(500).json({ message: "Failed to load deleted page detail" })
  }
}

// Restore deleted page:
// - restore the page + all deleted descendants
// - restore deleted ancestors so the page returns under its original parent
export async function restoreDeletedPage(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const pageId = String(id || "").trim()
    if (!pageId) return res.status(400).json({ message: "id is required" })
    const body = (req.body || {}) as { category_id?: unknown }
    const requestedCategoryId = typeof body.category_id === "string" && body.category_id.trim() ? body.category_id.trim() : null

    await client.query("BEGIN")

    // Ensure the page exists + is deleted (ownership enforced)
    const cur = await client.query(
      `SELECT id, tenant_id, parent_id, category_id, metadata, status, deleted_at
       FROM posts
       WHERE id = $1 AND author_id = $2
       FOR UPDATE`,
      [pageId, userId]
    )
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Post not found" })
    }
    const row = cur.rows[0] as any
    const tenantId = String(row.tenant_id)
    if (!isDeletedRow(row)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ message: "Post is not deleted" })
    }

    const categoryLost = Boolean(row?.metadata?.category_lost) || row?.metadata?.category_lost === true || String(row?.metadata?.category_lost || "").toLowerCase() === "true"
    const needsCategory = !row?.category_id || categoryLost
    if (needsCategory) {
      if (!requestedCategoryId) {
        await client.query("ROLLBACK")
        return res.status(400).json({ message: "CATEGORY_REQUIRED" })
      }
      // Validate access to the chosen category.
      await assertCategoryAccess({ categoryId: requestedCategoryId, tenantId, userId })
    } else if (requestedCategoryId) {
      // If user explicitly picks a category even when not required, validate it too.
      await assertCategoryAccess({ categoryId: requestedCategoryId, tenantId, userId })
    }

    // collect ids: ancestors + subtree
    const ids = await client.query(
      `
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
      `,
      [pageId, tenantId, userId]
    )
    const restoreIds = (ids.rows || []).map((r: any) => String(r.id)).filter(Boolean)

    if (restoreIds.length) {
      await client.query(
        `UPDATE posts
         SET status = 'draft',
             deleted_at = NULL,
             metadata = (COALESCE(metadata, '{}'::jsonb) - 'category_lost'),
             updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND tenant_id = $2
           AND author_id = $3`,
        [restoreIds, tenantId, userId]
      )
    }

    // Apply chosen category to restored "roots" (top-level items in the restored set).
    // - If page is/was uncategorized, force user to choose and apply to roots.
    // - Children under a parent usually don't need category_id.
    if (requestedCategoryId) {
      const rel = await client.query(
        `SELECT id::text AS id, parent_id::text AS parent_id
         FROM posts
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND author_id = $3`,
        [restoreIds, tenantId, userId]
      )
      const parentMap = new Map<string, string | null>()
      for (const r of rel.rows as Array<{ id: string; parent_id: string | null }>) parentMap.set(String(r.id), r.parent_id ? String(r.parent_id) : null)
      const idSet = new Set<string>(restoreIds)
      const roots: string[] = []
      for (const id of restoreIds) {
        const pid = parentMap.get(String(id)) || null
        if (!pid || !idSet.has(pid)) roots.push(String(id))
      }
      if (roots.length) {
        await client.query(
          `UPDATE posts
           SET category_id = $4, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND author_id = $3`,
          [roots, tenantId, userId, requestedCategoryId]
        )
      }
    }

    await client.query("COMMIT")
    return res.json({ ok: true, restored_ids: restoreIds })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service restoreDeletedPage error:", e)
    return res.status(500).json({ message: "Failed to restore deleted page" })
  } finally {
    client.release()
  }
}

// Permanently delete deleted page subtree (hard delete). This cascades to post_blocks via FK.
export async function purgeDeletedPage(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const pageId = String(id || "").trim()
    if (!pageId) return res.status(400).json({ message: "id is required" })

    await client.query("BEGIN")

    const cur = await client.query(
      `SELECT id, tenant_id, status, deleted_at
       FROM posts
       WHERE id = $1 AND author_id = $2
       FOR UPDATE`,
      [pageId, userId]
    )
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Post not found" })
    }
    const row = cur.rows[0] as any
    const tenantId = String(row.tenant_id)
    if (!isDeletedRow(row)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ message: "Post is not deleted" })
    }

    const ids = await client.query(
      `
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
      `,
      [pageId, tenantId, userId]
    )
    const purgeIds = (ids.rows || []).map((r: any) => String(r.id)).filter(Boolean)
    if (!purgeIds.length) {
      await client.query("ROLLBACK")
      return res.json({ ok: true, deleted_ids: [] })
    }

    // Only delete rows that are actually deleted (safety)
    await client.query(
      `DELETE FROM posts
       WHERE id = ANY($1::uuid[])
         AND tenant_id = $2
         AND author_id = $3
         AND (deleted_at IS NOT NULL OR COALESCE(status,'') = 'deleted')`,
      [purgeIds, tenantId, userId]
    )

    await client.query("COMMIT")
    return res.json({ ok: true, deleted_ids: purgeIds })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service purgeDeletedPage error:", e)
    return res.status(500).json({ message: "Failed to purge deleted page" })
  } finally {
    client.release()
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
export async function movePage(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const userId = (req as AuthedRequest).userId
    const { id } = req.params
    const body = (req.body || {}) as any

    const targetParentId = body.targetParentId === null ? null :
      typeof body.targetParentId === "string" && body.targetParentId.trim() ? body.targetParentId.trim() : undefined
    const afterPageId = typeof body.afterPageId === "string" && body.afterPageId.trim() ? body.afterPageId.trim() : null
    const beforePageId = typeof body.beforePageId === "string" && body.beforePageId.trim() ? body.beforePageId.trim() : null

    await client.query("BEGIN")

    // Verify the page exists and belongs to user
    const pageRes = await client.query(
      `SELECT id, parent_id, category_id, page_order, tenant_id
       FROM posts
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [id, userId]
    )
    if (pageRes.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ message: "Page not found" })
    }
    const page = pageRes.rows[0]
    const tenantId = String(page.tenant_id)
    const oldParentId = page.parent_id
    const categoryId = page.category_id

    // Determine new parent_id
    let newParentId: string | null = oldParentId
    if (targetParentId !== undefined) {
      newParentId = targetParentId
    }

    // Verify new parent exists and belongs to user (if not null)
    if (newParentId) {
      const parentRes = await client.query(
        `SELECT id, category_id FROM posts
         WHERE id = $1 AND tenant_id = $2 AND author_id = $3 AND deleted_at IS NULL
         LIMIT 1`,
        [newParentId, tenantId, userId]
      )
      if (parentRes.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ message: "Invalid targetParentId" })
      }
      // Prevent moving a page into itself or its descendants
      // Check if newParentId is a descendant of id
      const descendantCheck = await client.query(
        `WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM posts WHERE id = $1 AND tenant_id = $2
           UNION ALL
           SELECT p.id, p.parent_id FROM posts p INNER JOIN ancestors a ON p.id = a.parent_id WHERE p.tenant_id = $2
         )
         SELECT id FROM ancestors WHERE id = $3`,
        [newParentId, tenantId, id]
      )
      if (descendantCheck.rows.length > 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ message: "Cannot move a page into itself or its descendant" })
      }
    }

    // Get current siblings at the target level (build query dynamically to avoid $ index mismatch)
    let siblingsQuery = `SELECT id, page_order FROM posts
       WHERE tenant_id = $1 AND author_id = $2 AND deleted_at IS NULL
         AND COALESCE(status, '') <> 'deleted'`
    const siblingsParams: (string | null)[] = [tenantId, userId]

    if (newParentId) {
      siblingsQuery += ` AND parent_id = $${siblingsParams.length + 1}`
      siblingsParams.push(newParentId)
    } else {
      siblingsQuery += ` AND parent_id IS NULL`
    }

    if (categoryId) {
      siblingsQuery += ` AND category_id = $${siblingsParams.length + 1}`
      siblingsParams.push(categoryId)
    } else {
      siblingsQuery += ` AND category_id IS NULL`
    }

    siblingsQuery += ` ORDER BY page_order ASC, created_at ASC, id ASC`

    const siblingsRes = await client.query(siblingsQuery, siblingsParams)
    const siblings = siblingsRes.rows.filter((s: any) => String(s.id) !== String(id)) as { id: string; page_order: number }[]

    // Calculate new page_order
    let newPageOrder = 1
    if (beforePageId) {
      const idx = siblings.findIndex((s) => String(s.id) === beforePageId)
      if (idx >= 0) {
        newPageOrder = idx + 1
      }
    } else if (afterPageId) {
      const idx = siblings.findIndex((s) => String(s.id) === afterPageId)
      if (idx >= 0) {
        newPageOrder = idx + 2
      } else {
        newPageOrder = siblings.length + 1
      }
    } else {
      // No position specified, place at end
      newPageOrder = siblings.length + 1
    }

    // Update the moved page
    await client.query(
      `UPDATE posts
       SET parent_id = $3, page_order = $4, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, newParentId, newPageOrder]
    )

    // Reorder siblings to maintain consistent ordering
    // Insert the moved page at the correct position and renumber
    const finalOrder = [...siblings]
    finalOrder.splice(newPageOrder - 1, 0, { id, page_order: newPageOrder })
    for (let i = 0; i < finalOrder.length; i++) {
      if (String(finalOrder[i].id) === String(id)) continue // already updated
      if (finalOrder[i].page_order !== i + 1) {
        await client.query(
          `UPDATE posts SET page_order = $3 WHERE id = $1 AND tenant_id = $2`,
          [finalOrder[i].id, tenantId, i + 1]
        )
      }
    }

    // Update child_count on old and new parents
    if (oldParentId && oldParentId !== newParentId) {
      await client.query(
        `UPDATE posts SET child_count = GREATEST(0, child_count - 1), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [oldParentId, tenantId]
      )
    }
    if (newParentId && newParentId !== oldParentId) {
      await client.query(
        `UPDATE posts SET child_count = child_count + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [newParentId, tenantId]
      )
    }

    await client.query("COMMIT")

    // Return updated page info
    const updated = await query(
      `SELECT id, parent_id, page_order, title FROM posts WHERE id = $1`,
      [id]
    )
    return res.json(updated.rows[0] || { ok: true })
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service movePage error:", e)
    return res.status(500).json({ message: "Failed to move page" })
  } finally {
    client.release()
  }
}

