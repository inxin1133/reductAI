import { Router } from 'express';
import { getPermissions } from '../controllers/permissionController';

const router = Router();

router.get('/', getPermissions);

export default router;

