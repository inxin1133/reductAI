import { Router } from 'express';
import { getNamespaces, getNamespace, createNamespace, updateNamespace, deleteNamespace } from '../controllers/namespaceController';

const router = Router();

router.get('/', getNamespaces);
router.get('/:id', getNamespace);
router.post('/', createNamespace);
router.put('/:id', updateNamespace);
router.delete('/:id', deleteNamespace);

export default router;

