"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newAssetId = newAssetId;
exports.storeImageDataUrlAsAsset = storeImageDataUrlAsAsset;
const crypto_1 = __importDefault(require("crypto"));
const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || "http://localhost:3008";
function newAssetId() {
    return crypto_1.default.randomUUID();
}
async function storeImageDataUrlAsAsset(args) {
    const headers = { "Content-Type": "application/json" };
    const authHeader = (args.authHeader || "").trim();
    if (authHeader)
        headers.Authorization = authHeader;
    const body = {
        conversation_id: args.conversationId,
        message_id: args.messageId,
        asset_id: args.assetId,
        data_url: args.dataUrl,
        index: args.index,
        kind: args.kind,
        source_type: args.sourceType,
    };
    if (args.planTier)
        body.plan_tier = args.planTier;
    const res = await fetch(`${FILE_SERVICE_URL}/api/ai/media/assets`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail = typeof json?.message === "string" ? json.message : JSON.stringify(json);
        throw new Error(`FILE_SERVICE_HTTP_${res.status}:${detail}`);
    }
    const assetId = String(json?.assetId || json?.asset_id || "");
    const url = String(json?.url || "");
    if (!assetId || !url) {
        throw new Error(`FILE_SERVICE_INVALID_RESPONSE:${JSON.stringify(json)}`);
    }
    return {
        assetId,
        url,
        mime: String(json?.mime || ""),
        bytes: Number(json?.bytes || 0),
        sha256: String(json?.sha256 || ""),
        storageKey: String(json?.storageKey || json?.storage_key || ""),
    };
}
