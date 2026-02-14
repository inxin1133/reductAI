import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/send-verification-code', authController.sendVerificationCode);
router.post('/verify-code', authController.verifyCode);
router.post('/check-email', authController.checkEmail);
router.post('/reset-password', authController.resetPassword);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/change-password', requireAuth, authController.changePassword);

export default router;

