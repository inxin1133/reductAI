"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaAsset = getMediaAsset;
const db_1 = require("../config/db");
const systemTenantService_1 = require("../services/systemTenantService");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
function mediaRootDir() {
    const root = process.env.MEDIA_STORAGE_ROOT;
    if (root && root.trim())
        return root.trim();
    return path_1.default.join(process.cwd(), "storage", "media");
}
function safeResolveUnderRoot(root, rel) {
    const absRoot = path_1.default.resolve(root);
    const abs = path_1.default.resolve(path_1.default.join(absRoot, rel));
    if (!abs.startsWith(absRoot + path_1.default.sep) && abs !== absRoot) {
        throw new Error("INVALID_STORAGE_KEY");
    }
    return abs;
}
async function getMediaAsset(req, res) {
    try {
        const tenantId = await (0, systemTenantService_1.ensureSystemTenantId)();
        const userId = req.userId;
        const id = String(req.params.id || "").trim();
        if (!id)
            return res.status(400).json({ message: "id is required" });
        const r = await (0, db_1.query)(`
      SELECT
        a.id,
        a.tenant_id,
        a.user_id,
        a.conversation_id,
        a.message_id,
        a.kind,
        a.mime,
        a.bytes,
        a.storage_provider,
        a.storage_bucket,
        a.storage_key,
        a.public_url,
        a.is_private,
        c.user_id AS conversation_user_id
      FROM message_media_assets a
      JOIN model_conversations c ON c.id = a.conversation_id
      WHERE a.id = $1 AND a.tenant_id = $2
      LIMIT 1
      `, [id, tenantId]);
        if (r.rows.length === 0)
            return res.status(404).json({ message: "Not found" });
        const row = r.rows[0];
        // private asset: must belong to the requesting user
        if (row.is_private) {
            const owner = row.conversation_user_id ? String(row.conversation_user_id) : "";
            if (!owner || owner !== String(userId))
                return res.status(404).json({ message: "Not found" });
        }
        const provider = String(row.storage_provider || "");
        if (provider === "http") {
            const url = typeof row.public_url === "string" ? row.public_url : "";
            if (!url)
                return res.status(404).json({ message: "No url" });
            return res.redirect(302, url);
        }
        if (provider === "local_fs") {
            const key = typeof row.storage_key === "string" ? row.storage_key : "";
            if (!key)
                return res.status(404).json({ message: "No storage_key" });
            const root = mediaRootDir();
            const abs = safeResolveUnderRoot(root, key);
            const buf = await promises_1.default.readFile(abs);
            const mime = typeof row.mime === "string" && row.mime.trim() ? String(row.mime) : "application/octet-stream";
            res.setHeader("Content-Type", mime);
            res.setHeader("Cache-Control", "private, max-age=3600");
            return res.status(200).send(buf);
        }
        // db_proxy or unsupported (future): not implemented
        return res.status(404).json({ message: `Unsupported storage_provider: ${provider}` });
    }
    catch (e) {
        console.error("getMediaAsset error:", e);
        return res.status(500).json({ message: "Failed to get media asset", details: String(e?.message || e) });
    }
}
