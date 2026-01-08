import type { Request, Response } from "express"
import pool, { query } from "../config/db"

function num(v: any): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : 0
}

async function nextSortKey(postId: string, parentBlockId: string | null): Promise<number> {
  const r = await query(
    `SELECT COALESCE(MAX(sort_key), 0) AS m
     FROM post_blocks
     WHERE post_id = $1 AND parent_block_id ${parentBlockId ? "= $2" : "IS NULL"} AND is_deleted = FALSE`,
    parentBlockId ? [postId, parentBlockId] : [postId]
  )
  return num(r.rows?.[0]?.m) + 1000
}

async function computeBetweenSortKey(args: {
  postId: string
  parentBlockId: string | null
  beforeId?: string | null
  afterId?: string | null
}) {
  const { postId, parentBlockId, beforeId, afterId } = args

  const getKey = async (id: string) => {
    const r = await query(
      `SELECT sort_key FROM post_blocks WHERE id = $1 AND post_id = $2 LIMIT 1`,
      [id, postId]
    )
    if (r.rows.length === 0) return null
    return num(r.rows[0].sort_key)
  }

  if (beforeId && afterId) {
    const a = await getKey(beforeId)
    const b = await getKey(afterId)
    if (a === null || b === null) return nextSortKey(postId, parentBlockId)
    const mid = (a + b) / 2
    return mid === a || mid === b ? nextSortKey(postId, parentBlockId) : mid
  }
  if (beforeId) {
    const a = await getKey(beforeId)
    return a === null ? nextSortKey(postId, parentBlockId) : a - 1000
  }
  if (afterId) {
    const b = await getKey(afterId)
    return b === null ? nextSortKey(postId, parentBlockId) : b + 1000
  }

  return nextSortKey(postId, parentBlockId)
}

export async function listBlocks(req: Request, res: Response) {
  try {
    const { id: postId } = req.params
    const parentBlockId = typeof req.query.parentBlockId === "string" ? req.query.parentBlockId : null

    const r = await query(
      `SELECT *
       FROM post_blocks
       WHERE post_id = $1
         AND parent_block_id ${parentBlockId ? "= $2" : "IS NULL"}
         AND is_deleted = FALSE
       ORDER BY sort_key ASC`,
      parentBlockId ? [postId, parentBlockId] : [postId]
    )
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listBlocks error:", e)
    return res.status(500).json({ message: "Failed to list blocks" })
  }
}

export async function createBlock(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id: postId } = req.params
    const body = req.body as any

    const blockType = String(body.block_type || body.blockType || "paragraph")
    const parentBlockId = body.parent_block_id ?? body.parentBlockId ?? null
    const content = body.content ?? {}
    const contentText = typeof body.content_text === "string" ? body.content_text : body.contentText ?? null
    const refPostId = typeof body.ref_post_id === "string" ? body.ref_post_id : body.refPostId ?? null
    const externalEmbedId =
      typeof body.external_embed_id === "string" ? body.external_embed_id : body.externalEmbedId ?? null
    const pmSchemaVersion = typeof body.pm_schema_version === "number" ? body.pm_schema_version : body.pmSchemaVersion ?? 1

    const sortKey =
      typeof body.sort_key === "number"
        ? body.sort_key
        : typeof body.sortKey === "number"
          ? body.sortKey
          : await computeBetweenSortKey({
              postId,
              parentBlockId,
              beforeId: body.beforeBlockId ?? null,
              afterId: body.afterBlockId ?? null,
            })

    await client.query("BEGIN")
    const r = await client.query(
      `INSERT INTO post_blocks (
         post_id, parent_block_id, block_type, sort_key, content, content_text, ref_post_id, external_embed_id,
         is_deleted, pm_schema_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9)
       RETURNING *`,
      [
        postId,
        parentBlockId,
        blockType,
        sortKey,
        content,
        contentText,
        refPostId,
        externalEmbedId,
        pmSchemaVersion,
      ]
    )
    await client.query("COMMIT")
    return res.status(201).json(r.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service createBlock error:", e)
    return res.status(500).json({ message: "Failed to create block" })
  } finally {
    client.release()
  }
}

export async function updateBlock(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id: postId, blockId } = req.params as any
    const body = req.body as any

    const fields: string[] = []
    const params: any[] = [blockId, postId]
    let i = params.length

    function add(name: string, value: any) {
      i += 1
      params.push(value)
      fields.push(`${name} = $${i}`)
    }

    if (body.block_type !== undefined || body.blockType !== undefined) add("block_type", String(body.block_type ?? body.blockType))
    if (body.parent_block_id !== undefined || body.parentBlockId !== undefined)
      add("parent_block_id", body.parent_block_id ?? body.parentBlockId ?? null)
    if (body.content !== undefined) add("content", body.content)
    if (body.content_text !== undefined || body.contentText !== undefined)
      add("content_text", typeof body.content_text === "string" ? body.content_text : body.contentText ?? null)
    if (body.ref_post_id !== undefined || body.refPostId !== undefined)
      add("ref_post_id", body.ref_post_id ?? body.refPostId ?? null)
    if (body.external_embed_id !== undefined || body.externalEmbedId !== undefined)
      add("external_embed_id", body.external_embed_id ?? body.externalEmbedId ?? null)
    if (body.is_deleted !== undefined) add("is_deleted", !!body.is_deleted)
    if (body.deleted_at !== undefined) add("deleted_at", body.deleted_at ?? null)

    if (fields.length === 0) return res.status(400).json({ message: "No updatable fields" })

    await client.query("BEGIN")
    const r = await client.query(
      `UPDATE post_blocks
       SET ${fields.join(", ")}
       WHERE id = $1 AND post_id = $2
       RETURNING *`,
      params
    )
    await client.query("COMMIT")

    if (r.rows.length === 0) return res.status(404).json({ message: "Block not found" })
    return res.json(r.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service updateBlock error:", e)
    return res.status(500).json({ message: "Failed to update block" })
  } finally {
    client.release()
  }
}

export async function deleteBlock(req: Request, res: Response) {
  try {
    const { id: postId, blockId } = req.params as any
    const r = await query(
      `UPDATE post_blocks
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND post_id = $2
       RETURNING id`,
      [blockId, postId]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: "Block not found" })
    return res.json({ ok: true })
  } catch (e) {
    console.error("post-service deleteBlock error:", e)
    return res.status(500).json({ message: "Failed to delete block" })
  }
}

export async function reorderBlock(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id: postId, blockId } = req.params as any
    const body = req.body as any
    const parentBlockId = body.parentBlockId ?? body.parent_block_id ?? null
    const beforeId = body.beforeBlockId ?? null
    const afterId = body.afterBlockId ?? null

    const sortKey = await computeBetweenSortKey({ postId, parentBlockId, beforeId, afterId })

    await client.query("BEGIN")
    const r = await client.query(
      `UPDATE post_blocks
       SET parent_block_id = $3, sort_key = $4
       WHERE id = $1 AND post_id = $2
       RETURNING *`,
      [blockId, postId, parentBlockId, sortKey]
    )
    await client.query("COMMIT")
    if (r.rows.length === 0) return res.status(404).json({ message: "Block not found" })
    return res.json(r.rows[0])
  } catch (e) {
    await client.query("ROLLBACK")
    console.error("post-service reorderBlock error:", e)
    return res.status(500).json({ message: "Failed to reorder block" })
  } finally {
    client.release()
  }
}

export async function listBacklinks(req: Request, res: Response) {
  try {
    const { id: postId } = req.params
    const r = await query(
      `SELECT * FROM post_backlinks WHERE target_post_id = $1 ORDER BY created_at DESC`,
      [postId]
    )
    return res.json(r.rows)
  } catch (e) {
    console.error("post-service listBacklinks error:", e)
    return res.status(500).json({ message: "Failed to list backlinks" })
  }
}


