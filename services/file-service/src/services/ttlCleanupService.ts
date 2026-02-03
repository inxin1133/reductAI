import fs from 'fs/promises';
import path from 'path';
import { query } from '../config/db';

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

function cleanupIntervalMs() {
  const raw = Number.parseInt(process.env.FILE_ASSET_CLEANUP_INTERVAL_MIN || '60', 10);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return minutes * 60 * 1000;
}

async function deleteExpiredBatch(limit = 200) {
  const res = await query(
    `
    SELECT id, storage_key
    FROM message_media_assets
    WHERE storage_provider = 'local_fs'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT $1
    `,
    [limit]
  );

  if (!res.rows.length) return;

  const root = mediaRootDir();
  for (const row of res.rows) {
    const id = String(row.id || '');
    const key = typeof row.storage_key === 'string' ? row.storage_key : '';
    if (key) {
      try {
        const abs = safeResolveUnderRoot(root, key);
        await fs.unlink(abs).catch(() => undefined);
      } catch (e) {
        console.warn('TTL cleanup invalid storage_key:', key, e);
      }
    }
    await query(`DELETE FROM message_media_assets WHERE id = $1`, [id]);
  }
}

export function startFileAssetCleanup() {
  const interval = cleanupIntervalMs();
  const run = async () => {
    try {
      await deleteExpiredBatch();
    } catch (e) {
      console.error('TTL cleanup failed:', e);
    }
  };

  void run();
  setInterval(run, interval);
}
