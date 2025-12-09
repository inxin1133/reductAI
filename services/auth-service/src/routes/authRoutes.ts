import { Router } from 'express';
import * as authController from '../controllers/authController';

const router = Router();

router.post('/send-verification-code', authController.sendVerificationCode);
router.post('/verify-code', authController.verifyCode);
router.post('/register', authController.register);
router.post('/login', authController.login);

export default router;

