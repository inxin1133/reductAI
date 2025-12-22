import { Request, Response } from "express"
import { query } from "../config/db"

type ProviderStatus = "active" | "inactive" | "deprecated"

// AI 제공업체 목록 조회
export async function getProviders(_req: Request, res: Response) {
  try {
    const result = await query(
      `SELECT 
        id, name, display_name, slug, description, website_url, api_base_url, documentation_url,
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
        id, name, display_name, slug, description, website_url, api_base_url, documentation_url,
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
      display_name,
      slug,
      description = null,
      website_url = null,
      api_base_url = null,
      documentation_url = null,
      status = "active",
      is_verified = false,
      metadata = {},
    }: {
      name: string
      display_name: string
      slug: string
      description?: string | null
      website_url?: string | null
      api_base_url?: string | null
      documentation_url?: string | null
      status?: ProviderStatus
      is_verified?: boolean
      metadata?: Record<string, unknown>
    } = req.body

    if (!name || !display_name || !slug) {
      return res.status(400).json({ message: "name, display_name, slug are required" })
    }

    const result = await query(
      `INSERT INTO ai_providers
        (name, display_name, slug, description, website_url, api_base_url, documentation_url, status, is_verified, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      RETURNING 
        id, name, display_name, slug, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`,
      [
        name,
        display_name,
        slug,
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
      display_name,
      slug,
      description = null,
      website_url = null,
      api_base_url = null,
      documentation_url = null,
      status,
      is_verified,
      metadata,
    }: {
      name?: string
      display_name?: string
      slug?: string
      description?: string | null
      website_url?: string | null
      api_base_url?: string | null
      documentation_url?: string | null
      status?: ProviderStatus
      is_verified?: boolean
      metadata?: Record<string, unknown>
    } = req.body

    // 부분 업데이트 지원
    const result = await query(
      `UPDATE ai_providers SET
        name = COALESCE($2, name),
        display_name = COALESCE($3, display_name),
        slug = COALESCE($4, slug),
        description = COALESCE($5, description),
        website_url = COALESCE($6, website_url),
        api_base_url = COALESCE($7, api_base_url),
        documentation_url = COALESCE($8, documentation_url),
        status = COALESCE($9, status),
        is_verified = COALESCE($10, is_verified),
        metadata = COALESCE($11::jsonb, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, name, display_name, slug, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`,
      [
        id,
        name ?? null,
        display_name ?? null,
        slug ?? null,
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


