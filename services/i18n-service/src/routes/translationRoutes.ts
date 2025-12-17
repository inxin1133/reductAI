import { Router } from 'express';
import { 
  getTranslations, 
  createTranslationKey, 
  updateTranslationValue, 
  deleteTranslationKey 
} from '../controllers/translationController';

const router = Router();

router.get('/', getTranslations); // 목록 조회
router.post('/keys', createTranslationKey); // 키 생성
router.put('/values', updateTranslationValue); // 번역 값 수정 (Upsert)
router.delete('/keys/:id', deleteTranslationKey); // 키 삭제

export default router;

