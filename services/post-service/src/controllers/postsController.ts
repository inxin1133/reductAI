import type { Request, Response } from "express"
import pool, { query } from "../config/db"
import { blocksToDocJson, docJsonToBlocks } from "../services/docMapping"
import type { AuthedRequest } from "../middleware/requireAuth"
import { ensureSystemTenantId } from "../services/systemTenantService"
import { randomUUID } from "crypto"

function parseIntOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? n : null
}

async function getPostMetaVersion(postId: string): Promise<number> {
  const r = await query(`SELECT COALESCE((metadata->>'doc_version')::int, 0) AS v FROM posts WHERE id = $1`, [
    postId,
  ])
  if (r.rows.length === 0) return 0
  return Number(r.rows[0]?.v || 0)
}

export async function getPostContent(req: Request, res: Response) {
  try {
    const { id } = req.params
    const version = await getPostMetaVersion(id)

    const p = await query(
      `SELECT id, title, status, deleted_at
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

    const nextEmbedIds = new Set<string>()
    for (const b of blocks) {
      if (b.block_type !== "page_link") continue
      const pm = b.content?.pm || b.content
      const display = pm?.attrs?.display
      const pid = typeof b.ref_post_id === "string" ? b.ref_post_id : null
      if (display === "embed" && pid) nextEmbedIds.add(pid)
    }

    for (const b of blocks) {
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

    const tenantId = (req as AuthedRequest).tenantId || (await ensureSystemTenantId())

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled"
    const pageType = typeof body.page_type === "string" ? body.page_type : "page"
    const visibility = typeof body.visibility === "string" ? body.visibility : "private"
    const status = typeof body.status === "string" ? body.status : "draft"
    const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null

    // slug must be unique within (tenant_id,parent_id)
    const slug = `page-${randomUUID().slice(0, 8)}`

    await client.query("BEGIN")

    // Validate parent_id (must exist and be owned by same user) if provided
    if (parentId) {
      const p = await client.query(
        `SELECT id
         FROM posts
         WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [parentId, userId]
      )
      if (p.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ message: "Invalid parent_id" })
      }
    }

    const r = await client.query(
      `INSERT INTO posts (
         tenant_id, parent_id, category_id, author_id, title, slug, page_type, status, visibility, metadata
       )
       VALUES ($1,$9,NULL,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id, parent_id, title, slug, created_at, updated_at`,
      [tenantId, userId, title, slug, pageType, status, visibility, JSON.stringify({ doc_version: 0 }), parentId]
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
    const r = await query(
      `SELECT id, parent_id, title, slug, page_type, status, visibility, child_count, page_order, updated_at
       FROM posts
       WHERE author_id = $1 AND deleted_at IS NULL AND COALESCE(status, '') <> 'deleted'
       -- IMPORTANT: keep ordering stable; opening/saving a page updates updated_at and should NOT reshuffle the tree.
       ORDER BY parent_id NULLS FIRST, page_order ASC, created_at ASC, id ASC`,
      [userId]
    )
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listMyPages error:", e)
    return res.status(500).json({ message: "Failed to list pages" })
  }
}

export async function getPostPreview(req: Request, res: Response) {
  try {
    const { id } = req.params
    const p = await query(
      `SELECT id, title, excerpt, updated_at
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

    return res.json({ id: row.id, title: row.title, summary, updated_at: row.updated_at })
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

    if (!title && !status) return res.status(400).json({ message: "title or status is required" })

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
    updates.push(`updated_at = NOW()`)

    const r = await client.query(
      `UPDATE posts
       SET ${updates.join(", ")}
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id, parent_id, title, status, deleted_at, updated_at`,
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


