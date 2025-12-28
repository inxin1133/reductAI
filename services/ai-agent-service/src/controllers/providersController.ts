import { Request, Response } from "express"
import { query } from "../config/db"

type ProviderStatus = "active" | "inactive" | "deprecated"

// AI 제공업체 목록 조회
export async function getProviders(_req: Request, res: Response) {
  try {
    const result = await query(
      `SELECT 
        id, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at
      FROM ai_providers
      ORDER BY created_at DESC`
    )
    res.json(result.rows)
  } catch (error) {
    console.error("getProviders error:", error)
    res.status(500).json({ message: "Failed to fetch providers" })
  }
}

// 단일 제공업체 조회
export async function getProvider(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(
      `SELECT 
        id, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at
      FROM ai_providers
      WHERE id = $1`,
      [id]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: "Provider not found" })
    res.json(result.rows[0])
  } catch (error) {
    console.error("getProvider error:", error)
    res.status(500).json({ message: "Failed to fetch provider" })
  }
}

// 제공업체 생성
export async function createProvider(req: Request, res: Response) {
  try {
    const {
      name,
      product_name,
      slug,
      logo_key = null,
      description = null,
      website_url = null,
      api_base_url = null,
      documentation_url = null,
      status = "active",
      is_verified = false,
      metadata = {},
    }: {
      name: string
      product_name: string
      slug: string
      logo_key?: string | null
      description?: string | null
      website_url?: string | null
      api_base_url?: string | null
      documentation_url?: string | null
      status?: ProviderStatus
      is_verified?: boolean
      metadata?: Record<string, unknown>
    } = req.body

    if (!name || !product_name || !slug) {
      return res.status(400).json({ message: "name, product_name, slug are required" })
    }

    const result = await query(
      `INSERT INTO ai_providers
        (name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url, status, is_verified, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING 
        id, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`,
      [
        name,
        product_name,
        slug,
        logo_key,
        description,
        website_url,
        api_base_url,
        documentation_url,
        status,
        is_verified,
        JSON.stringify(metadata || {}),
      ]
    )

    res.status(201).json(result.rows[0])
  } catch (error: any) {
    console.error("createProvider error:", error)
    // unique 제약 위반 처리
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Duplicate provider (name or slug already exists)" })
    }
    res.status(500).json({ message: "Failed to create provider" })
  }
}

// 제공업체 수정
export async function updateProvider(req: Request, res: Response) {
  try {
    const { id } = req.params
    const {
      name,
      product_name,
      slug,
      logo_key,
      description = null,
      website_url = null,
      api_base_url = null,
      documentation_url = null,
      status,
      is_verified,
      metadata,
    }: {
      name?: string
      product_name?: string
      slug?: string
      logo_key?: string | null
      description?: string | null
      website_url?: string | null
      api_base_url?: string | null
      documentation_url?: string | null
      status?: ProviderStatus
      is_verified?: boolean
      metadata?: Record<string, unknown>
    } = req.body

    // logo_key는 "미전달/유지", "삭제(NULL)", "설정(문자열)"의 3-state가 필요합니다.
    // - 기존 update 방식(COALESCE)은 NULL을 "유지"로 취급해 '삭제'가 불가능하므로, sentinel을 사용합니다.
    const LOGO_KEY_UNSET = "__LOGO_KEY__UNSET__"
    const LOGO_KEY_CLEAR = "__LOGO_KEY__CLEAR__"
    const logoKeyParam =
      typeof logo_key === "undefined"
        ? LOGO_KEY_UNSET
        : logo_key === null || logo_key === ""
          ? LOGO_KEY_CLEAR
          : logo_key

    // 부분 업데이트 지원
    const result = await query(
      `UPDATE ai_providers SET
        name = COALESCE($2, name),
        product_name = COALESCE($3, product_name),
        slug = COALESCE($4, slug),
        logo_key = CASE 
          WHEN $5 = '${LOGO_KEY_UNSET}' THEN logo_key
          WHEN $5 = '${LOGO_KEY_CLEAR}' THEN NULL
          ELSE $5
        END,
        description = COALESCE($6, description),
        website_url = COALESCE($7, website_url),
        api_base_url = COALESCE($8, api_base_url),
        documentation_url = COALESCE($9, documentation_url),
        status = COALESCE($10, status),
        is_verified = COALESCE($11, is_verified),
        metadata = COALESCE($12::jsonb, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`,
      [
        id,
        name ?? null,
        product_name ?? null,
        slug ?? null,
        logoKeyParam,
        description,
        website_url,
        api_base_url,
        documentation_url,
        status ?? null,
        typeof is_verified === "boolean" ? is_verified : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )

    if (result.rows.length === 0) return res.status(404).json({ message: "Provider not found" })
    res.json(result.rows[0])
  } catch (error: any) {
    console.error("updateProvider error:", error)
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Duplicate provider (name or slug already exists)" })
    }
    res.status(500).json({ message: "Failed to update provider" })
  }
}

// 제공업체 삭제
export async function deleteProvider(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM ai_providers WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Provider not found" })
    res.json({ ok: true })
  } catch (error) {
    console.error("deleteProvider error:", error)
    res.status(500).json({ message: "Failed to delete provider" })
  }
}


