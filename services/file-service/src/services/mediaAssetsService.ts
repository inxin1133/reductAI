import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../config/db';

type MediaKind = 'image' | 'audio' | 'video' | 'file';
type FileSourceType = 'ai_generated' | 'attachment' | 'post_upload' | 'external_link' | 'profile_image';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function parseDataUrl(s: string): { mime: string; base64: string } | null {
  const m = String(s || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1] || '';
  const base64 = m[2] || '';
  if (!mime || !base64) return null;
  return { mime, base64 };
}

function extFromMime(mime: string) {
  const m = mime.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'audio/mpeg') return 'mp3';
  if (m === 'audio/wav') return 'wav';
  if (m === 'audio/aac') return 'aac';
  if (m === 'audio/flac') return 'flac';
  if (m === 'audio/ogg') return 'ogg';
  if (m === 'audio/opus') return 'opus';
  if (m === 'video/mp4') return 'mp4';
  if (m === 'video/webm') return 'webm';
  return 'bin';
}

function mediaRootDir() {
  const root = process.env.MEDIA_STORAGE_ROOT;
  if (root && root.trim()) return root.trim();
  return path.join(process.cwd(), 'storage', 'media');
}

function ttlDays() {
  const raw = Number.parseInt(process.env.FILE_ASSET_TTL_DAYS || '15', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

function computeExpiresAt(applyTtl: boolean) {
  if (!applyTtl) return null;
  const days = ttlDays();
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function newAssetId() {
  return crypto.randomUUID();
}

export async function storeImageDataUrlAsAsset(args: {
  tenantId: string;
  userId: string | null;
  conversationId: string;
  messageId: string;
  assetId: string;
  dataUrl: string;
  index: number;
  kind?: MediaKind;
  sourceType?: FileSourceType;
}): Promise<{ assetId: string; url: string; mime: string; bytes: number; sha256: string; storageKey: string }> {
  const parsed = parseDataUrl(args.dataUrl);
  if (!parsed) throw new Error('INVALID_DATA_URL');

  const kind: MediaKind =
    args.kind ||
    (parsed.mime.toLowerCase().startsWith('image/')
      ? 'image'
      : parsed.mime.toLowerCase().startsWith('audio/')
        ? 'audio'
        : parsed.mime.toLowerCase().startsWith('video/')
          ? 'video'
          : 'file');

  const bytesBuf = Buffer.from(parsed.base64, 'base64');
  const sha256 = crypto.createHash('sha256').update(bytesBuf).digest('hex');
  const ext = extFromMime(parsed.mime);

  const root = mediaRootDir();
  const safeTenant = isUuid(args.tenantId) ? args.tenantId : 'tenant';
  const safeConv = isUuid(args.conversationId) ? args.conversationId : 'conversation';
  const safeMsg = isUuid(args.messageId) ? args.messageId : 'message';

  const relDir = path.join(safeTenant, safeConv, safeMsg);
  const fileName = `${String(args.index)}_${sha256.slice(0, 16)}.${ext}`;
  const relPath = path.join(relDir, fileName);
  const absPath = path.join(root, relPath);

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, bytesBuf);

  const sourceType: FileSourceType = args.sourceType || 'attachment';
  const expiresAt = computeExpiresAt(sourceType === 'attachment');

  await query(
    `
    INSERT INTO file_assets
      (id, tenant_id, user_id, source_type, reference_type, reference_id, kind, mime, bytes, sha256, status, storage_provider, storage_key, storage_url, is_private, expires_at, metadata)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'stored','local_fs',$11,NULL,TRUE,$12,$13::jsonb)
    `,
    [
      args.assetId,
      args.tenantId,
      args.userId,
      sourceType,
      'message',
      args.messageId,
      kind,
      parsed.mime,
      bytesBuf.length,
      sha256,
      relPath,
      expiresAt,
      JSON.stringify({
        source: 'data_url',
        conversation_id: args.conversationId,
        message_id: args.messageId,
        ttl_days: sourceType === 'attachment' ? ttlDays() : null,
      }),
    ]
  );

  return {
    assetId: args.assetId,
    url: `/api/ai/media/assets/${args.assetId}`,
    mime: parsed.mime,
    bytes: bytesBuf.length,
    sha256,
    storageKey: relPath,
  };
}
