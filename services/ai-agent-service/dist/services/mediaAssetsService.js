"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeImageDataUrlAsAsset = storeImageDataUrlAsAsset;
exports.newAssetId = newAssetId;
const db_1 = require("../config/db");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
function isUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function parseDataUrl(s) {
    const m = String(s || "").match(/^data:([^;]+);base64,(.*)$/);
    if (!m)
        return null;
    const mime = m[1] || "";
    const base64 = m[2] || "";
    if (!mime || !base64)
        return null;
    return { mime, base64 };
}
function extFromMime(mime) {
    const m = mime.toLowerCase();
    if (m === "image/png")
        return "png";
    if (m === "image/jpeg")
        return "jpg";
    if (m === "image/webp")
        return "webp";
    if (m === "image/gif")
        return "gif";
    if (m === "image/svg+xml")
        return "svg";
    if (m === "audio/mpeg")
        return "mp3";
    if (m === "audio/wav")
        return "wav";
    if (m === "audio/aac")
        return "aac";
    if (m === "audio/flac")
        return "flac";
    if (m === "audio/ogg")
        return "ogg";
    if (m === "audio/opus")
        return "opus";
    if (m === "video/mp4")
        return "mp4";
    if (m === "video/webm")
        return "webm";
    return "bin";
}
function mediaRootDir() {
    // Keep a stable directory inside the service, so we can later switch to S3/GCS without changing DB rows too much.
    // You can override this with an env var in deployment.
    const root = process.env.MEDIA_STORAGE_ROOT;
    if (root && root.trim())
        return root.trim();
    return path_1.default.join(process.cwd(), "storage", "media");
}
async function storeImageDataUrlAsAsset(args) {
    const parsed = parseDataUrl(args.dataUrl);
    if (!parsed)
        throw new Error("INVALID_DATA_URL");
    const kind = args.kind ||
        (parsed.mime.toLowerCase().startsWith("image/")
            ? "image"
            : parsed.mime.toLowerCase().startsWith("audio/")
                ? "audio"
                : parsed.mime.toLowerCase().startsWith("video/")
                    ? "video"
                    : "file");
    const bytesBuf = Buffer.from(parsed.base64, "base64");
    const sha256 = crypto_1.default.createHash("sha256").update(bytesBuf).digest("hex");
    const ext = extFromMime(parsed.mime);
    const root = mediaRootDir();
    const safeTenant = isUuid(args.tenantId) ? args.tenantId : "tenant";
    const safeConv = isUuid(args.conversationId) ? args.conversationId : "conversation";
    const safeMsg = isUuid(args.messageId) ? args.messageId : "message";
    const relDir = path_1.default.join(safeTenant, safeConv, safeMsg);
    const fileName = `${String(args.index)}_${sha256.slice(0, 16)}.${ext}`;
    const relPath = path_1.default.join(relDir, fileName);
    const absPath = path_1.default.join(root, relPath);
    await promises_1.default.mkdir(path_1.default.dirname(absPath), { recursive: true });
    await promises_1.default.writeFile(absPath, bytesBuf);
    await (0, db_1.query)(`
    INSERT INTO message_media_assets
      (id, tenant_id, user_id, conversation_id, message_id, kind, mime, bytes, sha256, status, storage_provider, storage_key, is_private, metadata)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,'stored','local_fs',$10,TRUE,$11::jsonb)
    `, [
        args.assetId,
        args.tenantId,
        args.userId,
        args.conversationId,
        args.messageId,
        kind,
        parsed.mime,
        bytesBuf.length,
        sha256,
        relPath,
        JSON.stringify({ source: "data_url" }),
    ]);
    return {
        assetId: args.assetId,
        url: `/api/ai/media/assets/${args.assetId}`,
        mime: parsed.mime,
        bytes: bytesBuf.length,
        sha256,
        storageKey: relPath,
    };
}
function newAssetId() {
    return crypto_1.default.randomUUID();
}
