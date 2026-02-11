import { Router } from 'express';
import { getTenants, createTenant, updateTenant, deleteTenant, lookupTenants } from '../controllers/tenantController';

const router = Router();

router.get('/', getTenants);
router.post('/', createTenant);
router.post('/lookup', lookupTenants);
router.put('/:id', updateTenant);
router.delete('/:id', deleteTenant);

export default router;

