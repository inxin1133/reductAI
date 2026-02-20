import { Router } from 'express';
import { getUsers, getUser, updateUser, lookupUsers, listUserTenantMemberships, createUser } from '../controllers/userController';
import { listUserProviders, createUserProvider, deleteUserProvider } from '../controllers/providerController';

const router = Router();

// Route prefixes will be defined in main.ts, e.g., /api/users
router.get('/', getUsers);
router.post('/', createUser);
router.post('/lookup', lookupUsers);
router.get('/tenant-memberships', listUserTenantMemberships);
router.get('/providers', listUserProviders);
router.post('/providers', createUserProvider);
router.delete('/providers/:id', deleteUserProvider);
router.get('/:id', getUser);
router.put('/:id', updateUser);

export default router;

