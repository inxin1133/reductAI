import { Request, Response } from "express"
import pool, { query } from "../config/db"
import { encryptApiKey, sha256 } from "../services/cryptoService"
import { ensureSystemTenantId } from "../services/systemTenantService"

// 목록 조회 시 API Key는 절대 평문으로 내려주지 않습니다.
// Admin UI에서는 마스킹된 값(마지막 4자리)만 표시하도록 설계합니다.
function maskedFromLast4(last4?: string | null) {
  if (!last4) return null
  return `••••••••••${last4}`
}

// Credential 목록 조회
export async function getCredentials(req: Request, res: Response) {
  try {
    const { provider_id } = req.query

    // 공용 API Key는 system tenant에만 저장/조회합니다.
    const systemTenantId = await ensureSystemTenantId()

    const params: any[] = []
    const where: string[] = []

    params.push(systemTenantId)
    where.push(`c.tenant_id = $${params.length}`)

    if (provider_id) {
      params.push(provider_id)
      where.push(`c.provider_id = $${params.length}`)
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const result = await query(
      `SELECT
        c.id,
        c.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        c.provider_id,
        p.display_name AS provider_display_name,
        p.slug AS provider_slug,
        c.credential_name,
        c.endpoint_url,
        c.organization_id,
        c.is_active,
        c.is_default,
        c.rate_limit_per_minute,
        c.rate_limit_per_day,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.expires_at,
        NULLIF((c.metadata->>'last4')::text, '') AS api_key_last4
      FROM provider_api_credentials c
      JOIN ai_providers p ON p.id = c.provider_id
      JOIN tenants t ON t.id = c.tenant_id
      ${whereSql}
      ORDER BY c.created_at DESC`,
      params
    )

    const rows = result.rows.map((r) => ({
      ...r,
      api_key_masked: maskedFromLast4(r.api_key_last4),
    }))

    res.json(rows)
  } catch (error) {
    console.error("getCredentials error:", error)
    res.status(500).json({ message: "Failed to fetch credentials" })
  }
}

// 단일 Credential 조회
export async function getCredential(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT
        c.id,
        c.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        c.provider_id,
        p.display_name AS provider_display_name,
        p.slug AS provider_slug,
        c.credential_name,
        c.endpoint_url,
        c.organization_id,
        c.is_active,
        c.is_default,
        c.rate_limit_per_minute,
        c.rate_limit_per_day,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.expires_at,
        NULLIF((c.metadata->>'last4')::text, '') AS api_key_last4
      FROM provider_api_credentials c
      JOIN ai_providers p ON p.id = c.provider_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = $1`,
      [id]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Credential not found" })
    const row = result.rows[0]
    res.json({ ...row, api_key_masked: maskedFromLast4(row.api_key_last4) })
  } catch (error) {
    console.error("getCredential error:", error)
    res.status(500).json({ message: "Failed to fetch credential" })
  }
}

// Credential 생성
export async function createCredential(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const {
      provider_id,
      credential_name,
      api_key,
      endpoint_url = null,
      organization_id = null,
      is_active = true,
      is_default = false,
      rate_limit_per_minute = null,
      rate_limit_per_day = null,
      metadata = {},
      expires_at = null,
    }: {
      provider_id: string
      credential_name: string
      api_key: string
      endpoint_url?: string | null
      organization_id?: string | null
      is_active?: boolean
      is_default?: boolean
      rate_limit_per_minute?: number | null
      rate_limit_per_day?: number | null
      metadata?: Record<string, unknown>
      expires_at?: string | null
    } = req.body

    if (!provider_id || !credential_name || !api_key) {
      return res.status(400).json({ message: "provider_id, credential_name, api_key are required" })
    }

    // 공용 키는 system tenant에 저장
    const tenant_id = await ensureSystemTenantId()

    // 보안: DB에는 암호화/해시만 저장
    const encrypted = encryptApiKey(api_key)
    const hash = sha256(api_key)
    const last4 = api_key.slice(-4)

    // metadata에 last4를 기록(화면에서 마스킹 표시용)
    const metaWithLast4 = { ...(metadata || {}), last4 }

    await client.query("BEGIN")

    // 같은 테넌트/제공업체 내 default는 1개만 가능 (스키마의 partial unique index에 맞춰 선제 처리)
    if (is_default) {
      await client.query(
        `UPDATE provider_api_credentials
         SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND provider_id = $2 AND is_default = TRUE`,
        [tenant_id, provider_id]
      )
    }

    const insert = await client.query(
      `INSERT INTO provider_api_credentials
        (tenant_id, provider_id, credential_name, api_key_encrypted, api_key_hash, endpoint_url, organization_id,
         is_active, is_default, rate_limit_per_minute, rate_limit_per_day, metadata, expires_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
      RETURNING
        id, tenant_id, provider_id, credential_name, endpoint_url, organization_id,
        is_active, is_default, rate_limit_per_minute, rate_limit_per_day, metadata,
        created_at, updated_at, expires_at`,
      [
        tenant_id,
        provider_id,
        credential_name,
        encrypted,
        hash,
        endpoint_url,
        organization_id,
        is_active,
        is_default,
        rate_limit_per_minute,
        rate_limit_per_day,
        JSON.stringify(metaWithLast4),
        expires_at ? new Date(expires_at).toISOString() : null,
      ]
    )

    await client.query("COMMIT")

    const row = insert.rows[0]
    res.status(201).json({
      ...row,
      api_key_last4: last4,
      api_key_masked: maskedFromLast4(last4),
    })
  } catch (error: any) {
    await client.query("ROLLBACK")
    console.error("createCredential error:", error)
    if (error?.code === "23505") {
      // UNIQUE(tenant_id, provider_id, credential_name)
      return res.status(409).json({ message: "Duplicate credential_name for the same tenant/provider" })
    }
    res.status(500).json({ message: "Failed to create credential" })
  } finally {
    client.release()
  }
}

// Credential 수정
export async function updateCredential(req: Request, res: Response) {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const {
      provider_id,
      credential_name,
      api_key, // 선택: 제공하면 갱신
      endpoint_url = null,
      organization_id = null,
      is_active,
      is_default,
      rate_limit_per_minute = null,
      rate_limit_per_day = null,
      metadata,
      expires_at = null,
    }: {
      provider_id?: string
      credential_name?: string
      api_key?: string
      endpoint_url?: string | null
      organization_id?: string | null
      is_active?: boolean
      is_default?: boolean
      rate_limit_per_minute?: number | null
      rate_limit_per_day?: number | null
      metadata?: Record<string, unknown>
      expires_at?: string | null
    } = req.body

    // 기존 row 조회(tenant_id/provider_id를 모를 경우 default 처리에 필요)
    const current = await client.query(
      `SELECT id, tenant_id, provider_id, metadata
       FROM provider_api_credentials
       WHERE id = $1`,
      [id]
    )
    if (current.rows.length === 0) return res.status(404).json({ message: "Credential not found" })

    // 공용 키는 항상 system tenant에 귀속(tenant_id 변경 불가)
    const curTenantId = await ensureSystemTenantId()
    const curProviderId = provider_id || current.rows[0].provider_id

    let encrypted: string | null = null
    let hash: string | null = null
    let last4: string | null = null

    // metadata 병합
    let nextMeta: Record<string, unknown> | null = null
    if (metadata) {
      nextMeta = { ...(metadata || {}) }
    }

    if (api_key && api_key.trim()) {
      encrypted = encryptApiKey(api_key)
      hash = sha256(api_key)
      last4 = api_key.slice(-4)
      nextMeta = { ...(nextMeta || (current.rows[0].metadata || {})), last4 }
    }

    await client.query("BEGIN")

    // default 처리
    if (is_default === true) {
      await client.query(
        `UPDATE provider_api_credentials
         SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND provider_id = $2 AND is_default = TRUE AND id <> $3`,
        [curTenantId, curProviderId, id]
      )
    }

    const result = await client.query(
      `UPDATE provider_api_credentials SET
        tenant_id = $2,
        provider_id = COALESCE($3, provider_id),
        credential_name = COALESCE($4, credential_name),
        api_key_encrypted = COALESCE($5, api_key_encrypted),
        api_key_hash = COALESCE($6, api_key_hash),
        endpoint_url = COALESCE($7, endpoint_url),
        organization_id = COALESCE($8, organization_id),
        is_active = COALESCE($9, is_active),
        is_default = COALESCE($10, is_default),
        rate_limit_per_minute = COALESCE($11, rate_limit_per_minute),
        rate_limit_per_day = COALESCE($12, rate_limit_per_day),
        metadata = COALESCE($13::jsonb, metadata),
        expires_at = COALESCE($14, expires_at),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING
        id, tenant_id, provider_id, credential_name, endpoint_url, organization_id,
        is_active, is_default, rate_limit_per_minute, rate_limit_per_day, metadata,
        created_at, updated_at, expires_at`,
      [
        id,
        curTenantId,
        provider_id ?? null,
        credential_name ?? null,
        encrypted,
        hash,
        endpoint_url,
        organization_id,
        typeof is_active === "boolean" ? is_active : null,
        typeof is_default === "boolean" ? is_default : null,
        rate_limit_per_minute,
        rate_limit_per_day,
        nextMeta ? JSON.stringify(nextMeta) : null,
        expires_at ? new Date(expires_at).toISOString() : null,
      ]
    )

    await client.query("COMMIT")

    const row = result.rows[0]
    // last4는 업데이트 시 api_key가 들어온 경우에만 확정적으로 알 수 있고,
    // 그렇지 않은 경우에는 metadata에 저장된 last4를 사용합니다.
    const metaLast4 = (row.metadata?.last4 as string | undefined) || null
    const outLast4 = last4 || metaLast4

    res.json({
      ...row,
      api_key_last4: outLast4,
      api_key_masked: maskedFromLast4(outLast4),
    })
  } catch (error: any) {
    await client.query("ROLLBACK")
    console.error("updateCredential error:", error)
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Duplicate credential_name for the same tenant/provider" })
    }
    res.status(500).json({ message: "Failed to update credential" })
  } finally {
    client.release()
  }
}

// Credential 삭제
export async function deleteCredential(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM provider_api_credentials WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Credential not found" })
    res.json({ ok: true })
  } catch (error) {
    console.error("deleteCredential error:", error)
    res.status(500).json({ message: "Failed to delete credential" })
  }
}


