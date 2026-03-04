import { query } from "../config/db"

/**
 * Returns allowed model_api_ids for a plan_tier.
 * - If plan_model_access has NO rows for plan_tier: all models allowed (return null = no restriction)
 * - If plan_model_access has rows: only those model_api_ids are allowed
 */
export async function getAllowedModelApiIdsForPlan(planTier: string): Promise<string[] | null> {
  const tier = String(planTier || "").trim().toLowerCase()
  if (!tier) return null

  const res = await query(
    `
    SELECT m.model_id AS model_api_id
    FROM plan_model_access pma
    JOIN ai_models m ON m.id = pma.model_id
    WHERE pma.plan_tier = $1
      AND m.status = 'active'
      AND m.is_available = TRUE
    `,
    [tier]
  )

  const rows = res.rows as { model_api_id: string }[]
  if (rows.length === 0) return null // no restriction = all allowed

  return rows.map((r) => String(r.model_api_id || "").trim()).filter(Boolean)
}

/**
 * Returns allowed model DB ids for a plan_tier.
 * Same logic as getAllowedModelApiIdsForPlan but returns ai_models.id
 */
export async function getAllowedModelDbIdsForPlan(planTier: string): Promise<string[] | null> {
  const tier = String(planTier || "").trim().toLowerCase()
  if (!tier) return null

  const res = await query(
    `
    SELECT pma.model_id
    FROM plan_model_access pma
    JOIN ai_models m ON m.id = pma.model_id
    WHERE pma.plan_tier = $1
      AND m.status = 'active'
      AND m.is_available = TRUE
    `,
    [tier]
  )

  const rows = res.rows as { model_id: string }[]
  if (rows.length === 0) return null

  return rows.map((r) => String(r.model_id || "")).filter(Boolean)
}

/**
 * Check if a model (by DB id) is allowed for the given plan_tier.
 * - If plan_tier is empty: allow (no restriction)
 * - If plan_model_access has no rows for plan_tier: allow (pro+ = all)
 * - If plan_model_access has rows: model must be in the list
 */
export async function isModelAllowedForPlan(planTier: string, modelDbId: string): Promise<boolean> {
  const tier = String(planTier || "").trim().toLowerCase()
  const modelId = String(modelDbId || "").trim()

  if (!tier || !modelId) return true
  if (!/^[0-9a-f-]{36}$/i.test(modelId)) return false

  const allowed = await getAllowedModelDbIdsForPlan(tier)
  if (allowed === null) return true // no restriction

  return allowed.includes(modelId)
}
