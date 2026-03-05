"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllowedModelApiIdsForPlan = getAllowedModelApiIdsForPlan;
exports.getAllowedModelDbIdsForPlan = getAllowedModelDbIdsForPlan;
exports.isModelAllowedForPlan = isModelAllowedForPlan;
const db_1 = require("../config/db");
/**
 * Returns allowed model_api_ids for a plan_tier.
 * - If plan_model_access has NO rows for plan_tier: all models allowed (return null = no restriction)
 * - If plan_model_access has rows: only those model_api_ids are allowed
 */
async function getAllowedModelApiIdsForPlan(planTier) {
    const tier = String(planTier || "").trim().toLowerCase();
    if (!tier)
        return null;
    const res = await (0, db_1.query)(`
    SELECT m.model_id AS model_api_id
    FROM plan_model_access pma
    JOIN ai_models m ON m.id = pma.model_id
    WHERE pma.plan_tier = $1
      AND m.status = 'active'
      AND m.is_available = TRUE
    `, [tier]);
    const rows = res.rows;
    if (rows.length === 0)
        return null; // no restriction = all allowed
    return rows.map((r) => String(r.model_api_id || "").trim()).filter(Boolean);
}
/**
 * Returns allowed model DB ids for a plan_tier.
 * Same logic as getAllowedModelApiIdsForPlan but returns ai_models.id
 */
async function getAllowedModelDbIdsForPlan(planTier) {
    const tier = String(planTier || "").trim().toLowerCase();
    if (!tier)
        return null;
    const res = await (0, db_1.query)(`
    SELECT pma.model_id
    FROM plan_model_access pma
    JOIN ai_models m ON m.id = pma.model_id
    WHERE pma.plan_tier = $1
      AND m.status = 'active'
      AND m.is_available = TRUE
    `, [tier]);
    const rows = res.rows;
    if (rows.length === 0)
        return null;
    return rows.map((r) => String(r.model_id || "")).filter(Boolean);
}
/**
 * Check if a model (by DB id) is allowed for the given plan_tier.
 * - If plan_tier is empty: allow (no restriction)
 * - If plan_model_access has no rows for plan_tier: allow (pro+ = all)
 * - If plan_model_access has rows: model must be in the list
 */
async function isModelAllowedForPlan(planTier, modelDbId) {
    const tier = String(planTier || "").trim().toLowerCase();
    const modelId = String(modelDbId || "").trim();
    if (!tier || !modelId)
        return true;
    if (!/^[0-9a-f-]{36}$/i.test(modelId))
        return false;
    const allowed = await getAllowedModelDbIdsForPlan(tier);
    if (allowed === null)
        return true; // no restriction
    return allowed.includes(modelId);
}
