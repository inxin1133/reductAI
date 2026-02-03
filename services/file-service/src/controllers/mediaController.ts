import { Request, Response } from 'express';
import { query } from '../config/db';
import { AuthedRequest } from '../middleware/requireAuth';
import { ensureSystemTenantId } from '../services/systemTenantService';
import { newAssetId, storeImageDataUrlAsAsset } from '../services/mediaAssetsService';
import path from 'path';
import fs from 'fs/promises';

type MediaKind = 'image' | 'audio' | 'video' | 'file';
type FileSourceType = 'ai_generated' | 'attachment' | 'post_upload' | 'external_link' | 'profile_image';

function mediaRootDir() {
  const root = process.env.MEDIA_STORAGE_ROOT;
  if (root && root.trim()) return root.trim();
  return path.join(process.cwd(), 'storage', 'media');
}

function safeResolveUnderRoot(root: string, rel: string) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(path.join(absRoot, rel));
  if (!abs.startsWith(absRoot + path.sep) && abs !== absRoot) {
    throw new Error('INVALID_STORAGE_KEY');
  }
  return abs;
}

export async function createMediaAsset(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId();
    const userId = (req as AuthedRequest).userId || null;
    const body = (req.body || {}) as Record<string, unknown>;

    const conversationId = String(body.conversation_id || body.conversationId || '').trim();
    const messageId = String(body.message_id || body.messageId || '').trim();
    const dataUrl = String(body.data_url || body.dataUrl || '').trim();
    const sourceTypeRaw = String(body.source_type || body.sourceType || '').trim();
    const sourceType: FileSourceType = ([
      'ai_generated',
      'attachment',
      'post_upload',
      'external_link',
      'profile_image',
    ] as FileSourceType[]).includes(sourceTypeRaw as FileSourceType)
      ? (sourceTypeRaw as FileSourceType)
      : 'attachment';
    const kindRaw = typeof body.kind === 'string' ? body.kind.trim().toLowerCase() : '';
    const kind = (['image', 'audio', 'video', 'file'] as MediaKind[]).includes(kindRaw as MediaKind)
      ? (kindRaw as MediaKind)
      : undefined;
    const index = Number(body.index ?? 0);
    const assetId = String(body.asset_id || body.assetId || '').trim() || newAssetId();

    if (!conversationId || !messageId || !dataUrl) {
      return res.status(400).json({ message: 'conversation_id, message_id, data_url are required' });
    }
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ message: 'index must be a non-negative number' });
    }

    const stored = await storeImageDataUrlAsAsset({
      tenantId,
      userId,
      conversationId,
      messageId,
      assetId,
      dataUrl,
      index,
      kind,
      sourceType,
    });

    return res.status(201).json(stored);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === 'INVALID_DATA_URL') {
      return res.status(400).json({ message: 'Invalid data_url' });
    }
    console.error('createMediaAsset error:', e);
    return res.status(500).json({ message: 'Failed to create media asset', details: msg });
  }
}

export async function getMediaAsset(req: Request, res: Response) {
  try {
    const tenantId = await ensureSystemTenantId();
    const userId = (req as AuthedRequest).userId;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id is required' });

    const r = await query(
      `
      SELECT
        a.id,
        a.tenant_id,
        a.user_id,
        a.reference_type,
        a.reference_id,
        a.kind,
        a.mime,
        a.bytes,
        a.storage_provider,
        a.storage_bucket,
        a.storage_key,
        a.storage_url,
        a.cdn_url,
        a.is_private,
        c.user_id AS conversation_user_id
      FROM file_assets a
      LEFT JOIN model_messages mm
        ON a.reference_type = 'message'
        AND a.reference_id = mm.id
      LEFT JOIN model_conversations c
        ON c.id = mm.conversation_id
      WHERE a.id = $1 AND a.tenant_id = $2 AND a.status <> 'deleted'
      LIMIT 1
      `,
      [id, tenantId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const row = r.rows[0] as any;

    if (row.is_private) {
      const refType = String(row.reference_type || '');
      const owner =
        refType === 'message' && row.conversation_user_id ? String(row.conversation_user_id) : row.user_id ? String(row.user_id) : '';
      if (!owner || owner !== String(userId)) return res.status(404).json({ message: 'Not found' });
    }

    const provider = String(row.storage_provider || '');
    if (provider === 'http') {
      const url =
        typeof row.storage_url === 'string'
          ? row.storage_url
          : typeof row.cdn_url === 'string'
            ? row.cdn_url
            : '';
      if (!url) return res.status(404).json({ message: 'No url' });
      return res.redirect(302, url);
    }

    if (provider === 'local_fs') {
      const key = typeof row.storage_key === 'string' ? row.storage_key : '';
      if (!key) return res.status(404).json({ message: 'No storage_key' });
      const root = mediaRootDir();
      const abs = safeResolveUnderRoot(root, key);
      const buf = await fs.readFile(abs);
      const mime = typeof row.mime === 'string' && row.mime.trim() ? String(row.mime) : 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.status(200).send(buf);
    }

    return res.status(404).json({ message: `Unsupported storage_provider: ${provider}` });
  } catch (e: any) {
    console.error('getMediaAsset error:', e);
    return res.status(500).json({ message: 'Failed to get media asset', details: String(e?.message || e) });
  }
}
