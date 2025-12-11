import { Router } from 'express';
import { getUsers, getUser, updateUser } from '../controllers/userController';

const router = Router();

// Route prefixes will be defined in main.ts, e.g., /api/users
router.get('/', getUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);

export default router;

