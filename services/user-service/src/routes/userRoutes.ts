import { Router } from 'express';
import { getUsers, getUser, updateUser, lookupUsers } from '../controllers/userController';

const router = Router();

// Route prefixes will be defined in main.ts, e.g., /api/users
router.get('/', getUsers);
router.post('/lookup', lookupUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);

export default router;

