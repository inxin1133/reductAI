import { Request, Response } from 'express';
import { query } from '../config/db';
import { AuthedRequest } from '../middleware/requireAuth';
import { ensureSystemTenantId } from '../services/systemTenantService';
import { newAssetId, storeBytesAsAsset, storeImageDataUrlAsAsset } from '../services/mediaAssetsService';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import archiver from 'archiver';

type MediaKind = 'image' | 'audio' | 'video' | 'file';
type FileSourceType = 'ai_generated' | 'attachment' | 'post_upload' | 'external_link' | 'profile_image';
type AssetScope = 'user' | 'tenant';

const VALID_SOURCE_TYPES = new Set<FileSourceType>([
  'ai_generated',
  'attachment',
  'post_upload',
  'external_link',
  'profile_image',
]);

const VALID_KINDS = new Set<MediaKind>(['image', 'audio', 'video', 'file']);

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

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((v) => String(v).trim())
    .filter(Boolean);
}

async function resolveTenantId(req: AuthedRequest): Promise<{ tenantId: string; hasTenantId: boolean }> {
  if (req.tenantId) return { tenantId: String(req.tenantId), hasTenantId: true };
  return { tenantId: await ensureSystemTenantId(), hasTenantId: false };
}

function parseScope(q: Record<string, unknown>, hasTenantId: boolean): AssetScope {
  if (!hasTenantId) return 'user';
  const raw = q.scope ?? q.scope_type ?? q.scopeType;
  return String(raw || '').toLowerCase() === 'tenant' ? 'tenant' : 'user';
}

function ttlDays() {
  const raw = Number.parseInt(process.env.FILE_ASSET_TTL_DAYS || '15', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeFileName(raw: string) {
  const trimmed = String(raw || '').trim();
  const noSlashes = trimmed.replace(/[\\/]/g, '_');
  const safe = noSlashes.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return safe || 'file';
}

function buildFileName(row: any) {
  const original = sanitizeFileName(String(row.original_filename || ''));
  const id = String(row.id || '').trim();
  const mime = String(row.mime || '').trim();
  const extFromMime = mime.includes('/') ? mime.split('/')[1] : '';
  let name = original || (id ? `file_${id}` : 'file');
  const ext = path.extname(name);
  if (!ext && extFromMime) {
    name = `${name}.${extFromMime}`;
  }
  return name;
}

function ensureUniqueName(name: string, used: Set<string>) {
  const base = name;
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  let i = 1;
  let candidate = `${stem} (${i})${ext}`;
  while (used.has(candidate.toLowerCase())) {
    i += 1;
    candidate = `${stem} (${i})${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function createMediaAsset(req: Request, res: Response) {
  try {
    const { tenantId } = await resolveTenantId(req as AuthedRequest);
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
      if (msg === 'FILE_TOO_LARGE') {
        return res.status(413).json({ message: 'File too large' });
      }
    if (msg === 'INVALID_DATA_URL') {
      return res.status(400).json({ message: 'Invalid data_url' });
    }
    console.error('createMediaAsset error:', e);
    return res.status(500).json({ message: 'Failed to create media asset', details: msg });
  }
}

export async function createMediaAssetUpload(req: Request, res: Response) {
  try {
    const { tenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId || null;

    const q = (req.query || {}) as Record<string, unknown>;
    const conversationId = String(q.conversation_id || q.conversationId || req.headers['x-conversation-id'] || '').trim();
    const messageId = String(q.message_id || q.messageId || req.headers['x-message-id'] || '').trim();
    const sourceTypeRaw = String(q.source_type || q.sourceType || req.headers['x-source-type'] || '').trim();
    const sourceType: FileSourceType = ([
      'ai_generated',
      'attachment',
      'post_upload',
      'external_link',
      'profile_image',
    ] as FileSourceType[]).includes(sourceTypeRaw as FileSourceType)
      ? (sourceTypeRaw as FileSourceType)
      : 'attachment';
    const kindRaw = typeof q.kind === 'string' ? q.kind.trim().toLowerCase() : '';
    const kind = (['image', 'audio', 'video', 'file'] as MediaKind[]).includes(kindRaw as MediaKind)
      ? (kindRaw as MediaKind)
      : undefined;
    const index = Number(q.index ?? req.headers['x-index'] ?? 0);
    const assetId = String(q.asset_id || q.assetId || req.headers['x-asset-id'] || '').trim() || newAssetId();
    const originalFilename = String(q.filename || q.original_filename || req.headers['x-filename'] || '').trim() || null;
    const mime = String(req.headers['content-type'] || 'application/octet-stream')
      .split(';')[0]
      .trim();

    const bytesBuf = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.from(String(req.body || ''), 'utf8');

    if (!conversationId || !messageId) {
      return res.status(400).json({ message: 'conversation_id and message_id are required' });
    }
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ message: 'index must be a non-negative number' });
    }
    if (!bytesBuf || bytesBuf.length === 0) {
      return res.status(400).json({ message: 'file bytes are required' });
    }

    const stored = await storeBytesAsAsset({
      tenantId,
      userId,
      conversationId,
      messageId,
      assetId,
      bytesBuf,
      mime,
      index,
      kind,
      sourceType,
      originalFilename,
    });

    return res.status(201).json(stored);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg === 'FILE_TOO_LARGE') {
      return res.status(413).json({ message: 'File too large' });
    }
    if (msg === 'INVALID_BYTES') {
      return res.status(400).json({ message: 'Invalid file bytes' });
    }
    console.error('createMediaAssetUpload error:', e);
    return res.status(500).json({ message: 'Failed to create media asset', details: msg });
  }
}

export async function listMediaAssets(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);

    const sourceRaw = q.source_type || q.sourceType || '';
    const kindRaw = q.kind || '';
    const pageScopeRaw = String(q.page_scope || q.pageScope || '').trim().toLowerCase();
    const searchRaw = String(q.q || q.search || '').trim();
    const includeExpired = String(q.include_expired || q.includeExpired || '').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(200, Number(q.limit ?? 100)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    const sourceTypes = parseList(sourceRaw).filter((s) => VALID_SOURCE_TYPES.has(s as FileSourceType));
    const kinds = parseList(kindRaw).filter((s) => VALID_KINDS.has(s as MediaKind));
    const pageCategoryType =
      pageScopeRaw === 'personal' || pageScopeRaw === 'user'
        ? 'personal_page'
        : pageScopeRaw === 'team' || pageScopeRaw === 'group' || pageScopeRaw === 'shared' || pageScopeRaw === 'tenant'
          ? 'team_page'
          : '';
    const isPersonalScope = pageCategoryType === 'personal_page';

    const where: string[] = [];
    if (pageCategoryType) {
      where.push(`a.status IN ('stored','deleted')`);
    } else {
      where.push(`a.status <> 'deleted'`);
    }
    const params: any[] = [];
    const joinSql =
      pageCategoryType
        ? `JOIN file_asset_post_links l ON l.asset_id = a.id
           JOIN posts p ON p.id = l.post_id AND p.deleted_at IS NULL AND COALESCE(p.status,'') <> 'deleted'`
        : '';
    if (!isPersonalScope) {
      params.push(tenantId);
      where.push(`a.tenant_id = $${params.length}`);
    }
    if (scope !== 'tenant') {
      params.push(userId);
      where.push(`a.user_id = $${params.length}`);
    }
    if (!includeExpired) where.push('(a.expires_at IS NULL OR a.expires_at > NOW())');

    const pageScopeSourceDefaults = ['post_upload', 'ai_generated', 'attachment'];
    const effectiveSourceTypes =
      pageCategoryType && sourceTypes.length === 0 ? pageScopeSourceDefaults : sourceTypes;
    if (effectiveSourceTypes.length > 0) {
      params.push(effectiveSourceTypes);
      where.push(`a.source_type = ANY($${params.length}::text[])`);
    }
    if (kinds.length > 0) {
      params.push(kinds);
      where.push(`a.kind = ANY($${params.length}::text[])`);
    }
    if (searchRaw) {
      params.push(`%${searchRaw}%`);
      where.push(`(a.original_filename ILIKE $${params.length} OR a.storage_key ILIKE $${params.length})`);
    }
    if (pageCategoryType) {
      params.push(pageCategoryType);
      where.push(`l.scope_type = $${params.length}`);
      if (pageCategoryType === 'personal_page') {
        params.push(userId);
        where.push(`l.owner_user_id = $${params.length}`);
      } else {
        params.push(tenantId);
        where.push(`l.tenant_id = $${params.length}`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await query(
      `
      SELECT COALESCE(SUM(sub.bytes),0)::bigint AS total_bytes,
             COUNT(*)::int AS total_count
      FROM (
        SELECT DISTINCT a.id, a.bytes
        FROM file_assets a
        ${joinSql}
        ${whereSql}
      ) sub
      `,
      params
    );
    const totalBytes = Number(totalRes.rows[0]?.total_bytes || 0);
    const totalCount = Number(totalRes.rows[0]?.total_count || 0);

    const itemParams = [...params, limit, offset];
    const itemRes = await query(
      `
      SELECT DISTINCT
        a.id,
        a.source_type,
        a.kind,
        a.mime,
        a.bytes,
        a.original_filename,
        a.storage_provider,
        a.storage_key,
        a.storage_url,
        a.cdn_url,
        a.is_private,
        a.expires_at,
        a.created_at,
        a.updated_at,
        a.metadata,
        a.status,
        mm.metadata->>'model' AS model_api_id,
        mm.metadata->>'provider_slug' AS provider_slug,
        mm.metadata->>'provider_key' AS provider_key,
        am.display_name AS model_display_name,
        ap.name AS provider_name,
        ap.product_name AS provider_product_name,
        ap.logo_key AS provider_logo_key
      FROM file_assets a
      ${joinSql}
      LEFT JOIN model_messages mm
        ON a.reference_type = 'message'
        AND a.reference_id = mm.id
      LEFT JOIN ai_models am
        ON am.model_id = (mm.metadata->>'model')
      LEFT JOIN ai_providers ap
        ON ap.slug = (mm.metadata->>'provider_slug')
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
      `,
      itemParams
    );

    const items = itemRes.rows.map((row: any) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      return {
        id: String(row.id),
        url: `/api/ai/media/assets/${row.id}`,
        source_type: row.source_type,
        kind: row.kind,
        mime: row.mime,
        bytes: Number(row.bytes || 0),
        original_filename: row.original_filename,
        storage_provider: row.storage_provider,
        storage_key: row.storage_key,
        storage_url: row.storage_url,
        cdn_url: row.cdn_url,
        is_private: Boolean(row.is_private),
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        status: row.status,
        metadata,
        is_favorite: Boolean((metadata as any)?.favorite),
        is_missing: String(row.status || '') === 'deleted',
        is_pinned:
          row.source_type === 'attachment' && (row.expires_at === null || typeof row.expires_at === 'undefined'),
        model_api_id: row.model_api_id,
        model_display_name: row.model_display_name,
        provider_slug: row.provider_slug,
        provider_key: row.provider_key,
        provider_name: row.provider_name,
        provider_product_name: row.provider_product_name,
        provider_logo_key: row.provider_logo_key,
      };
    });

    return res.json({ items, total_bytes: totalBytes, total_count: totalCount });
  } catch (e: any) {
    console.error('listMediaAssets error:', e);
    return res.status(500).json({ message: 'Failed to list media assets' });
  }
}

export async function deleteMediaAsset(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id is required' });

    const baseWhere: string[] = ['id = $1', 'tenant_id = $2'];
    const baseParams: any[] = [id, tenantId];
    if (scope !== 'tenant') {
      baseParams.push(userId);
      baseWhere.push(`user_id = $${baseParams.length}`);
    }

    const selectWhere = [...baseWhere, "status <> 'deleted'"];
    const r = await query(
      `
      SELECT id, storage_provider, storage_key
      FROM file_assets
      WHERE ${selectWhere.join(' AND ')}
      LIMIT 1
      `,
      baseParams
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const row = r.rows[0] as any;

    if (String(row.storage_provider || '') === 'local_fs') {
      const key = typeof row.storage_key === 'string' ? row.storage_key : '';
      if (key) {
        const root = mediaRootDir();
        const abs = safeResolveUnderRoot(root, key);
        try {
          await fs.unlink(abs);
        } catch (err: any) {
          if (err?.code !== 'ENOENT') console.warn('deleteMediaAsset unlink error:', err);
        }
      }
    }

    await query(
      `
      UPDATE file_assets
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE ${baseWhere.join(' AND ')}
      `,
      baseParams
    );

    return res.json({ ok: true });
  } catch (e: any) {
    console.error('deleteMediaAsset error:', e);
    return res.status(500).json({ message: 'Failed to delete media asset' });
  }
}

export async function updateMediaAssetPin(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id is required' });
    const body = (req.body || {}) as Record<string, unknown>;
    const pinned = Boolean(body.pinned);

    const baseWhere: string[] = ['id = $1', 'tenant_id = $2'];
    const baseParams: any[] = [id, tenantId];
    if (scope !== 'tenant') {
      baseParams.push(userId);
      baseWhere.push(`user_id = $${baseParams.length}`);
    }
    const selectWhere = [...baseWhere, "status <> 'deleted'"];

    const current = await query(
      `
      SELECT id, source_type, expires_at, metadata
      FROM file_assets
      WHERE ${selectWhere.join(' AND ')}
      LIMIT 1
      `,
      baseParams
    );
    if (current.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const row = current.rows[0] as any;
    if (String(row.source_type) !== 'attachment') {
      return res.status(400).json({ message: 'Only attachment assets can be pinned' });
    }

    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const pinnedByPost = Boolean((meta as any)?.pinned_by_post);
    if (!pinned && pinnedByPost) {
      return res.status(400).json({ message: 'Pinned by post; cannot unpin' });
    }

    const expiresAt = pinned ? null : new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000);
    const expiresIdx = baseParams.length + 1;
    const pinnedIdx = baseParams.length + 2;
    const r = await query(
      `
      UPDATE file_assets
      SET expires_at = $${expiresIdx},
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{pinned_by_user}', to_jsonb($${pinnedIdx}::boolean), true),
          updated_at = CURRENT_TIMESTAMP
      WHERE ${baseWhere.join(' AND ')}
      RETURNING id, expires_at, metadata
      `,
      [...baseParams, expiresAt, pinned]
    );
    const next = r.rows[0] as any;
    return res.json({
      ok: true,
      id,
      pinned,
      expires_at: next?.expires_at ?? null,
      metadata: next?.metadata ?? {},
    });
  } catch (e: any) {
    console.error('updateMediaAssetPin error:', e);
    return res.status(500).json({ message: 'Failed to update pin state' });
  }
}

export async function updateMediaAssetFavorite(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id is required' });
    const body = (req.body || {}) as Record<string, unknown>;
    const favorite = Boolean(body.favorite);

    const where: string[] = ['id = $1', 'tenant_id = $2', "status <> 'deleted'"];
    const params: any[] = [id, tenantId];
    if (scope !== 'tenant') {
      params.push(userId);
      where.push(`user_id = $${params.length}`);
    }
    const favoriteIdx = params.length + 1;
    const r = await query(
      `
      UPDATE file_assets
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{favorite}', to_jsonb($${favoriteIdx}::boolean), true),
          updated_at = CURRENT_TIMESTAMP
      WHERE ${where.join(' AND ')}
      RETURNING id, metadata
      `,
      [...params, favorite]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    return res.json({ ok: true, id, favorite });
  } catch (e: any) {
    console.error('updateMediaAssetFavorite error:', e);
    return res.status(500).json({ message: 'Failed to update favorite state' });
  }
}

export async function getMediaAsset(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);
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

    if (row.is_private && scope !== 'tenant') {
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

export async function downloadMediaAssetsZip(req: Request, res: Response) {
  try {
    const { tenantId, hasTenantId } = await resolveTenantId(req as AuthedRequest);
    const userId = (req as AuthedRequest).userId;
    const q = (req.query || {}) as Record<string, unknown>;
    const scope = parseScope(q, hasTenantId);
    const body = (req.body || {}) as Record<string, unknown>;
    const rawIds = Array.isArray(body.ids)
      ? body.ids
      : Array.isArray(body.asset_ids)
        ? body.asset_ids
        : Array.isArray(body.assetIds)
          ? body.assetIds
          : [];
    const ids = rawIds.map((v) => String(v)).filter((v) => isUuid(v));
    if (!ids.length) return res.status(400).json({ message: 'ids are required' });
    const limitedIds = ids.slice(0, 200);

    const where: string[] = ['tenant_id = $1', "status <> 'deleted'"];
    const params: any[] = [tenantId];
    if (scope !== 'tenant') {
      params.push(userId);
      where.push(`user_id = $${params.length}`);
    }
    params.push(limitedIds);
    where.push(`id = ANY($${params.length}::uuid[])`);
    const r = await query(
      `
      SELECT id, original_filename, mime, storage_provider, storage_key, storage_url, cdn_url
      FROM file_assets
      WHERE ${where.join(' AND ')}
      `,
      params
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'No files found' });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="files_${stamp}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('downloadMediaAssetsZip error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to build zip' });
      } else {
        res.end();
      }
    });
    archive.pipe(res);

    const root = mediaRootDir();
    const usedNames = new Set<string>();
    const missing: string[] = [];

    for (const row of r.rows as any[]) {
      const fileName = ensureUniqueName(buildFileName(row), usedNames);
      const provider = String(row.storage_provider || '');
      if (provider === 'local_fs') {
        const key = typeof row.storage_key === 'string' ? row.storage_key : '';
        if (!key) {
          missing.push(`${fileName} (missing storage_key)`);
          continue;
        }
        try {
          const abs = safeResolveUnderRoot(root, key);
          await fs.stat(abs);
          archive.append(createReadStream(abs), { name: fileName });
        } catch (e) {
          missing.push(`${fileName} (missing file)`);
        }
        continue;
      }

      const url =
        typeof row.storage_url === 'string'
          ? row.storage_url
          : typeof row.cdn_url === 'string'
            ? row.cdn_url
            : '';
      if (!url) {
        missing.push(`${fileName} (no url)`);
        continue;
      }
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          missing.push(`${fileName} (fetch failed: ${resp.status})`);
          continue;
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        archive.append(buf, { name: fileName });
      } catch {
        missing.push(`${fileName} (fetch error)`);
      }
    }

    if (missing.length) {
      archive.append(missing.join('\n'), { name: '__missing_files__.txt' });
    }

    await archive.finalize();
    return;
  } catch (e: any) {
    console.error('downloadMediaAssetsZip error:', e);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Failed to download zip', details: String(e?.message || e) });
    }
    return;
  }
}
