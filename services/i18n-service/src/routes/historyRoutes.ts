import { Router } from 'express';
import { getTranslationHistory } from '../controllers/historyController';

const router = Router();

router.get('/', getTranslationHistory);

export default router;

