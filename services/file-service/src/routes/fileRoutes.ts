import { Router } from 'express';
import { listFiles, getFile, createFile, deleteFile } from '../controllers/fileController';

const router = Router();

router.get('/', listFiles);
router.get('/:id', getFile);
router.post('/', createFile);
router.delete('/:id', deleteFile);

export default router;
