import express from 'express';
import { getLanguages, createLanguage, updateLanguage, deleteLanguage } from '../controllers/i18nController';

const router = express.Router();

router.get('/languages', getLanguages);
router.post('/languages', createLanguage);
router.put('/languages/:id', updateLanguage);
router.delete('/languages/:id', deleteLanguage);

export default router;

