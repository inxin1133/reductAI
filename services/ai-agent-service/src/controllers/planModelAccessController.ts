import { Request, Response } from "express"
import { query } from "../config/db"

const PLAN_TIERS = ["free", "pro", "premium", "business", "enterprise"] as const

function isPlanTier(x: string): boolean {
  return PLAN_TIERS.includes(x as (typeof PLAN_TIERS)[number])
}

// 목록 조회 (plan_tier 필수)
export async function listPlanModelAccess(req: Request, res: Response) {
  try {
    const plan_tier = (req.query.plan_tier as string)?.trim()?.toLowerCase()
    if (!plan_tier || !isPlanTier(plan_tier)) {
      return res.status(400).json({ message: "plan_tier is required (free|pro|premium|business|enterprise)" })
    }

    const result = await query(
      `SELECT
        pma.id,
        pma.plan_tier,
        pma.model_id,
        pma.created_at,
        m.display_name AS model_display_name,
        m.model_id AS model_api_id,
        m.model_type,
        p.product_name AS provider_product_name,
        p.slug AS provider_slug
      FROM plan_model_access pma
      JOIN ai_models m ON m.id = pma.model_id
      JOIN ai_providers p ON p.id = m.provider_id
      WHERE pma.plan_tier = $1
      ORDER BY p.product_name ASC, m.display_name ASC`,
      [plan_tier]
    )
    res.json(result.rows)
  } catch (error) {
    console.error("listPlanModelAccess error:", error)
    res.status(500).json({ message: "Failed to fetch plan model access" })
  }
}

// 생성
export async function createPlanModelAccess(req: Request, res: Response) {
  try {
    const { plan_tier, model_id }: { plan_tier?: string; model_id?: string } = req.body

    const tier = (plan_tier as string)?.trim()?.toLowerCase()
    const modelId = (model_id as string)?.trim()

    if (!tier || !isPlanTier(tier) || !modelId) {
      return res.status(400).json({ message: "plan_tier and model_id are required" })
    }

    const result = await query(
      `INSERT INTO plan_model_access (plan_tier, model_id)
       VALUES ($1, $2)
       RETURNING id, plan_tier, model_id, created_at`,
      [tier, modelId]
    )
    res.status(201).json(result.rows[0])
  } catch (error: unknown) {
    console.error("createPlanModelAccess error:", error)
    const pg = error as { code?: string }
    if (pg?.code === "23505") {
      return res.status(409).json({ message: "This model is already configured for this plan tier" })
    }
    if (pg?.code === "23503") {
      return res.status(400).json({ message: "model_id does not exist" })
    }
    res.status(500).json({ message: "Failed to create plan model access" })
  }
}

// 단건 삭제
export async function deletePlanModelAccessById(req: Request, res: Response) {
  try {
    const { id } = req.params
    const result = await query(`DELETE FROM plan_model_access WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" })
    res.json({ ok: true })
  } catch (error) {
    console.error("deletePlanModelAccessById error:", error)
    res.status(500).json({ message: "Failed to delete plan model access" })
  }
}

// 플랜 티어 전체 삭제 (모든 모델 허용으로 전환)
export async function deletePlanModelAccessByTier(req: Request, res: Response) {
  try {
    const plan_tier = (req.query.plan_tier as string)?.trim()?.toLowerCase()
    if (!plan_tier || !isPlanTier(plan_tier)) {
      return res.status(400).json({ message: "plan_tier is required (free|pro|premium|business|enterprise)" })
    }

    const result = await query(
      `DELETE FROM plan_model_access WHERE plan_tier = $1 RETURNING id`,
      [plan_tier]
    )
    res.json({ ok: true, deleted: result.rows.length })
  } catch (error) {
    console.error("deletePlanModelAccessByTier error:", error)
    res.status(500).json({ message: "Failed to delete plan model access by tier" })
  }
}
