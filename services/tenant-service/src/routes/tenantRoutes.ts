import { Router } from 'express';
import { getTenants, createTenant, updateTenant, deleteTenant, lookupTenants } from '../controllers/tenantController';
import {
  listTenantMemberships,
  createTenantMembership,
  updateTenantMembership,
} from '../controllers/membershipController';
import {
  listTenantInvitations,
  createTenantInvitation,
  updateTenantInvitation,
} from '../controllers/invitationController';

const router = Router();

router.get('/', getTenants);
router.post('/', createTenant);
router.post('/lookup', lookupTenants);
router.get('/memberships', listTenantMemberships);
router.post('/memberships', createTenantMembership);
router.put('/memberships/:id', updateTenantMembership);
router.get('/invitations', listTenantInvitations);
router.post('/invitations', createTenantInvitation);
router.put('/invitations/:id', updateTenantInvitation);
router.put('/:id', updateTenant);
router.delete('/:id', deleteTenant);

export default router;

