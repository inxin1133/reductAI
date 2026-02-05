import express from 'express';
import { requireAuth, verifyJwtToken } from '../middleware/requireAuth';
import {
  createMediaAsset,
  createMediaAssetUpload,
  deleteMediaAsset,
  downloadMediaAssetsZip,
  getMediaAsset,
  listMediaAssets,
  updateMediaAssetFavorite,
  updateMediaAssetPin,
} from '../controllers/mediaController';

const router = express.Router();

router.use((req: any, res: any, next: any) => {
  const header = String(req.headers.authorization || '');
  const m = header.match(/^Bearer\s+(.+)$/i);
  const headerToken = m?.[1];
  if (headerToken) return requireAuth(req, res, next);

  const q = req.query as Record<string, unknown>;
  const token = typeof q.token === 'string' ? q.token : '';
  if (!token) return res.status(401).json({ message: 'Missing Authorization token' });
  try {
    const decoded = verifyJwtToken(token);
    const userId = decoded?.userId;
    if (!userId) return res.status(401).json({ message: 'Invalid token payload (missing userId)' });
    (req as any).userId = String(userId);
    if (decoded?.email) (req as any).email = String(decoded.email);
    if (decoded?.tenantId) (req as any).tenantId = String(decoded.tenantId);
    return next();
  } catch (e) {
    console.error('media auth error:', e);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

router.post('/assets/upload', express.raw({ type: '*/*', limit: '25mb' }), createMediaAssetUpload);
router.post('/assets', createMediaAsset);
router.post('/assets/zip', downloadMediaAssetsZip);
router.get('/assets', listMediaAssets);
router.get('/assets/:id', getMediaAsset);
router.delete('/assets/:id', deleteMediaAsset);
router.patch('/assets/:id/pin', updateMediaAssetPin);
router.patch('/assets/:id/favorite', updateMediaAssetFavorite);

export default router;
