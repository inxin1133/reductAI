import { Request, Response } from "express"
import pool, { query } from "../config/db"
import { ensureSystemTenantId } from "../services/systemTenantService"

type TenantType = "personal" | "team" | "group"
type AccessStatus = "active" | "inactive" | "suspended"
type AccessLevel = "standard" | "premium" | "enterprise"

function isTenantType(x: any): x is TenantType {
  return x === "personal" || x === "team" || x === "group"
}

// 목록 조회 (tenant_type 필수)
export async function getTypeModelAccess(req: Request, res: Response) {
  try {
    const tenant_type = req.query.tenant_type as string | undefined
    if (!tenant_type || !isTenantType(tenant_type)) {
      return res.status(400).json({ message: "tenant_type is required (personal|team|group)" })
    }

    const result = await query(
      `SELECT
        a.id,
        a.tenant_type,
        a.model_id,
        a.credential_id,
        a.status,
        a.access_level,
        a.priority,
        a.is_preferred,
        a.rate_limit_per_minute,
        a.rate_limit_per_day,
        a.max_tokens_per_request,
        a.allowed_features,
        a.metadata,
        a.created_at,
        a.updated_at,
        m.display_name AS model_display_name,
        m.model_id AS model_api_id,
        m.model_type,
        m.context_window,
        p.product_name AS provider_product_name,
        p.slug AS provider_slug,
        c.credential_name AS credential_name
      FROM tenant_type_model_access a
      JOIN ai_models m ON m.id = a.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      LEFT JOIN provider_api_credentials c ON c.id = a.credential_id
      WHERE a.tenant_type = $1
      ORDER BY a.priority DESC, p.product_name ASC, m.display_name ASC`,
      [tenant_type]
    )
    res.json(result.rows)
  } catch (error) {
    console.error("getTypeModelAccess error:", error)
    res.status(500).json({ message: "Failed to fetch type model access" })
  }
}

export async function getTypeModelAccessItem(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT
        a.*,
        m.display_name AS model_display_name,
        m.model_id AS model_api_id,
        m.model_type,
        p.product_name AS provider_product_name,
        p.slug AS provider_slug,
        c.credential_name AS credential_name
      FROM tenant_type_model_access a
      JOIN ai_models m ON m.id = a.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      LEFT JOIN provider_api_credentials c ON c.id = a.credential_id
      WHERE a.id = $1`,
      [id]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" })
    res.json(result.rows[0])
  } catch (error) {
    console.error("getTypeModelAccessItem error:", error)
    res.status(500).json({ message: "Failed to fetch item" })
  }
}

// 생성
export async function createTypeModelAccess(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const {
      tenant_type,
      model_id,
      credential_id = null,
      status = "active",
      access_level = "standard",
      priority = 0,
      is_preferred = false,
      rate_limit_per_minute = null,
      rate_limit_per_day = null,
      max_tokens_per_request = null,
      allowed_features = [],
      metadata = {},
    }: {
      tenant_type: TenantType
      model_id: string
      credential_id?: string | null
      status?: AccessStatus
      access_level?: AccessLevel
      priority?: number
      is_preferred?: boolean
      rate_limit_per_minute?: number | null
      rate_limit_per_day?: number | null
      max_tokens_per_request?: number | null
      allowed_features?: unknown
      metadata?: Record<string, unknown>
    } = req.body

    if (!tenant_type || !isTenantType(tenant_type) || !model_id) {
      return res.status(400).json({ message: "tenant_type and model_id are required" })
    }

    // credential은 공용(system tenant) 소속만 허용
    if (credential_id) {
      const systemTenantId = await ensureSystemTenantId()
      const check = await client.query(
        `SELECT id FROM provider_api_credentials WHERE id = $1 AND tenant_id = $2`,
        [credential_id, systemTenantId]
      )
      if (check.rows.length === 0) {
        return res.status(400).json({ message: "credential_id must reference a system (global) credential" })
      }
    }

    const allowed = Array.isArray(allowed_features) ? allowed_features : []

    await client.query("BEGIN")

    // 유형별 preferred는 1개를 권장 → true면 기존 preferred 해제
    if (is_preferred) {
      await client.query(
        `UPDATE tenant_type_model_access
         SET is_preferred = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_type = $1 AND is_preferred = TRUE`,
        [tenant_type]
      )
    }

    const result = await client.query(
      `INSERT INTO tenant_type_model_access
        (tenant_type, model_id, credential_id, status, access_level, priority, is_preferred,
         rate_limit_per_minute, rate_limit_per_day, max_tokens_per_request, allowed_features, metadata)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
       RETURNING *`,
      [
        tenant_type,
        model_id,
        credential_id,
        status,
        access_level,
        priority,
        is_preferred,
        rate_limit_per_minute,
        rate_limit_per_day,
        max_tokens_per_request,
        JSON.stringify(allowed),
        JSON.stringify(metadata || {}),
      ]
    )

    await client.query("COMMIT")
    res.status(201).json(result.rows[0])
  } catch (error: any) {
    await client.query("ROLLBACK")
    console.error("createTypeModelAccess error:", error)
    if (error?.code === "23505") {
      return res.status(409).json({ message: "This model is already configured for the tenant type" })
    }
    res.status(500).json({ message: "Failed to create type model access" })
  } finally {
    client.release()
  }
}

// 수정
export async function updateTypeModelAccess(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const {
      credential_id,
      status,
      access_level,
      priority,
      is_preferred,
      rate_limit_per_minute,
      rate_limit_per_day,
      max_tokens_per_request,
      allowed_features,
      metadata,
    }: {
      credential_id?: string | null
      status?: AccessStatus
      access_level?: AccessLevel
      priority?: number
      is_preferred?: boolean
      rate_limit_per_minute?: number | null
      rate_limit_per_day?: number | null
      max_tokens_per_request?: number | null
      allowed_features?: unknown
      metadata?: Record<string, unknown>
    } = req.body

    const cur = await client.query(`SELECT id, tenant_type FROM tenant_type_model_access WHERE id = $1`, [id])
    if (cur.rows.length === 0) return res.status(404).json({ message: "Item not found" })
    const tenantType = cur.rows[0].tenant_type as TenantType

    if (credential_id) {
      const systemTenantId = await ensureSystemTenantId()
      const check = await client.query(
        `SELECT id FROM provider_api_credentials WHERE id = $1 AND tenant_id = $2`,
        [credential_id, systemTenantId]
      )
      if (check.rows.length === 0) {
        return res.status(400).json({ message: "credential_id must reference a system (global) credential" })
      }
    }

    const allowed = Array.isArray(allowed_features) ? allowed_features : null

    await client.query("BEGIN")

    if (is_preferred === true) {
      await client.query(
        `UPDATE tenant_type_model_access
         SET is_preferred = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_type = $1 AND is_preferred = TRUE AND id <> $2`,
        [tenantType, id]
      )
    }

    const result = await client.query(
      `UPDATE tenant_type_model_access SET
        credential_id = COALESCE($2, credential_id),
        status = COALESCE($3, status),
        access_level = COALESCE($4, access_level),
        priority = COALESCE($5, priority),
        is_preferred = COALESCE($6, is_preferred),
        rate_limit_per_minute = COALESCE($7, rate_limit_per_minute),
        rate_limit_per_day = COALESCE($8, rate_limit_per_day),
        max_tokens_per_request = COALESCE($9, max_tokens_per_request),
        allowed_features = COALESCE($10::jsonb, allowed_features),
        metadata = COALESCE($11::jsonb, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
      [
        id,
        credential_id === undefined ? null : credential_id,
        status ?? null,
        access_level ?? null,
        typeof priority === "number" ? priority : null,
        typeof is_preferred === "boolean" ? is_preferred : null,
        rate_limit_per_minute ?? null,
        rate_limit_per_day ?? null,
        max_tokens_per_request ?? null,
        allowed ? JSON.stringify(allowed) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )

    await client.query("COMMIT")
    res.json(result.rows[0])
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("updateTypeModelAccess error:", error)
    res.status(500).json({ message: "Failed to update type model access" })
  } finally {
    client.release()
  }
}

export async function deleteTypeModelAccess(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM tenant_type_model_access WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" })
    res.json({ ok: true })
  } catch (error) {
    console.error("deleteTypeModelAccess error:", error)
    res.status(500).json({ message: "Failed to delete type model access" })
  }
}


