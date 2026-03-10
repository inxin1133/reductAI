"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviders = getProviders;
exports.getProvider = getProvider;
exports.createProvider = createProvider;
exports.updateProvider = updateProvider;
exports.reorderProviders = reorderProviders;
exports.deleteProvider = deleteProvider;
const db_1 = __importStar(require("../config/db"));
const providerClientKey_1 = require("../utils/providerClientKey");
// AI 제공업체 목록 조회
async function getProviders(_req, res) {
    try {
        const result = await (0, db_1.query)(`SELECT 
        id, provider_family, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, sort_order, created_at, updated_at
      FROM ai_providers
      ORDER BY sort_order ASC, created_at DESC`);
        res.json(result.rows);
    }
    catch (error) {
        console.error("getProviders error:", error);
        res.status(500).json({ message: "Failed to fetch providers" });
    }
}
// 단일 제공업체 조회
async function getProvider(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, db_1.query)(`SELECT 
        id, provider_family, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at
      FROM ai_providers
      WHERE id = $1`, [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Provider not found" });
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error("getProvider error:", error);
        res.status(500).json({ message: "Failed to fetch provider" });
    }
}
// 제공업체 생성
async function createProvider(req, res) {
    try {
        const { provider_family, name, product_name, slug, logo_key = null, description = null, website_url = null, api_base_url = null, documentation_url = null, status = "active", is_verified = false, metadata = {}, } = req.body;
        if (!name || !product_name || !slug) {
            return res.status(400).json({ message: "name, product_name, slug are required" });
        }
        const family = typeof provider_family === "string" && provider_family.trim()
            ? provider_family.trim().toLowerCase()
            : (0, providerClientKey_1.deriveProviderClientKey)(null, slug) || "custom";
        const result = await (0, db_1.query)(`INSERT INTO ai_providers
        (provider_family, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url, status, is_verified, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
      RETURNING 
        id, provider_family, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`, [
            family,
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
        ]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error("createProvider error:", error);
        // unique 제약 위반 처리
        if (error?.code === "23505") {
            return res.status(409).json({ message: "Duplicate provider (slug already exists)" });
        }
        res.status(500).json({ message: "Failed to create provider" });
    }
}
// 제공업체 수정
async function updateProvider(req, res) {
    try {
        const { id } = req.params;
        const { provider_family, name, product_name, slug, logo_key, description = null, website_url = null, api_base_url = null, documentation_url = null, status, is_verified, metadata, } = req.body;
        // logo_key는 "미전달/유지", "삭제(NULL)", "설정(문자열)"의 3-state가 필요합니다.
        // - 기존 update 방식(COALESCE)은 NULL을 "유지"로 취급해 '삭제'가 불가능하므로, sentinel을 사용합니다.
        const LOGO_KEY_UNSET = "__LOGO_KEY__UNSET__";
        const LOGO_KEY_CLEAR = "__LOGO_KEY__CLEAR__";
        const logoKeyParam = typeof logo_key === "undefined"
            ? LOGO_KEY_UNSET
            : logo_key === null || logo_key === ""
                ? LOGO_KEY_CLEAR
                : logo_key;
        // provider_family: 명시적으로 전달되면 사용, slug 변경 시 prefix에서 추론 (openai/google/anthropic)
        const familyToSet = typeof provider_family === "string" && provider_family.trim()
            ? provider_family.trim().toLowerCase()
            : slug && String(slug).trim()
                ? (0, providerClientKey_1.deriveProviderClientKey)(null, String(slug).trim())
                : null;
        // 부분 업데이트 지원
        const result = await (0, db_1.query)(`UPDATE ai_providers SET
        provider_family = COALESCE($2, provider_family),
        name = COALESCE($3, name),
        product_name = COALESCE($4, product_name),
        slug = COALESCE($5, slug),
        logo_key = CASE 
          WHEN $6 = '${LOGO_KEY_UNSET}' THEN logo_key
          WHEN $6 = '${LOGO_KEY_CLEAR}' THEN NULL
          ELSE $6
        END,
        description = COALESCE($7, description),
        website_url = COALESCE($8, website_url),
        api_base_url = COALESCE($9, api_base_url),
        documentation_url = COALESCE($10, documentation_url),
        status = COALESCE($11, status),
        is_verified = COALESCE($12, is_verified),
        metadata = COALESCE($13::jsonb, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id, provider_family, name, product_name, slug, logo_key, description, website_url, api_base_url, documentation_url,
        status, is_verified, metadata, created_at, updated_at`, [
            id,
            familyToSet,
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
        ]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Provider not found" });
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error("updateProvider error:", error);
        if (error?.code === "23505") {
            return res.status(409).json({ message: "Duplicate provider (slug already exists)" });
        }
        res.status(500).json({ message: "Failed to update provider" });
    }
}
// 순서 변경(드래그 정렬): ordered_ids 순서대로 sort_order 재부여
async function reorderProviders(req, res) {
    const client = await db_1.default.connect();
    try {
        const { ordered_ids } = (req.body || {});
        if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
            return res.status(400).json({ message: "ordered_ids[] is required" });
        }
        const ids = ordered_ids.map((x) => String(x)).filter(Boolean);
        if (ids.length !== ordered_ids.length) {
            return res.status(400).json({ message: "ordered_ids contains invalid id" });
        }
        await client.query("BEGIN");
        for (let i = 0; i < ids.length; i++) {
            await client.query(`UPDATE ai_providers SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [
                i * 10,
                ids[i],
            ]);
        }
        await client.query("COMMIT");
        res.json({ ok: true, count: ids.length });
    }
    catch (error) {
        try {
            await client.query("ROLLBACK");
        }
        catch {
            // ignore
        }
        console.error("reorderProviders error:", error);
        res.status(500).json({ message: "Failed to reorder providers" });
    }
    finally {
        client.release();
    }
}
// 제공업체 삭제
async function deleteProvider(req, res) {
    try {
        const { id } = req.params;
        const result = await (0, db_1.query)(`DELETE FROM ai_providers WHERE id = $1 RETURNING id`, [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Provider not found" });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("deleteProvider error:", error);
        res.status(500).json({ message: "Failed to delete provider" });
    }
}
