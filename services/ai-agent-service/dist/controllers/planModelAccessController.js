"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPlanModelAccess = listPlanModelAccess;
exports.createPlanModelAccess = createPlanModelAccess;
exports.deletePlanModelAccessById = deletePlanModelAccessById;
exports.deletePlanModelAccessByTier = deletePlanModelAccessByTier;
const db_1 = require("../config/db");
const PLAN_TIERS = ["free", "pro", "premium", "business", "enterprise"];
function isPlanTier(x) {
    return PLAN_TIERS.includes(x);
}
// 목록 조회 (plan_tier 필수)
async function listPlanModelAccess(req, res) {
    try {
        const plan_tier = req.query.plan_tier?.trim()?.toLowerCase();
        if (!plan_tier || !isPlanTier(plan_tier)) {
            return res.status(400).json({ message: "plan_tier is required (free|pro|premium|business|enterprise)" });
        }
        const result = await (0, db_1.query)(`SELECT
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
      ORDER BY p.product_name ASC, m.display_name ASC`, [plan_tier]);
        res.json(result.rows);
    }
    catch (error) {
        console.error("listPlanModelAccess error:", error);
        res.status(500).json({ message: "Failed to fetch plan model access" });
    }
}
// 생성
async function createPlanModelAccess(req, res) {
    try {
        const { plan_tier, model_id } = req.body;
        const tier = plan_tier?.trim()?.toLowerCase();
        const modelId = model_id?.trim();
        if (!tier || !isPlanTier(tier) || !modelId) {
            return res.status(400).json({ message: "plan_tier and model_id are required" });
        }
        const result = await (0, db_1.query)(`INSERT INTO plan_model_access (plan_tier, model_id)
       VALUES ($1, $2)
       RETURNING id, plan_tier, model_id, created_at`, [tier, modelId]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error("createPlanModelAccess error:", error);
        const pg = error;
        if (pg?.code === "23505") {
            return res.status(409).json({ message: "This model is already configured for this plan tier" });
        }
        if (pg?.code === "23503") {
            return res.status(400).json({ message: "model_id does not exist" });
        }
        res.status(500).json({ message: "Failed to create plan model access" });
    }
}
// 단건 삭제
async function deletePlanModelAccessById(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, db_1.query)(`DELETE FROM plan_model_access WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Item not found" });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("deletePlanModelAccessById error:", error);
        res.status(500).json({ message: "Failed to delete plan model access" });
    }
}
// 플랜 티어 전체 삭제 (모든 모델 허용으로 전환)
async function deletePlanModelAccessByTier(req, res) {
    try {
        const plan_tier = req.query.plan_tier?.trim()?.toLowerCase();
        if (!plan_tier || !isPlanTier(plan_tier)) {
            return res.status(400).json({ message: "plan_tier is required (free|pro|premium|business|enterprise)" });
        }
        const result = await (0, db_1.query)(`DELETE FROM plan_model_access WHERE plan_tier = $1 RETURNING id`, [plan_tier]);
        res.json({ ok: true, deleted: result.rows.length });
    }
    catch (error) {
        console.error("deletePlanModelAccessByTier error:", error);
        res.status(500).json({ message: "Failed to delete plan model access by tier" });
    }
}
