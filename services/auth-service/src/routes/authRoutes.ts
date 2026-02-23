import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/send-verification-code', authController.sendVerificationCode);
router.post('/verify-code', authController.verifyCode);
router.post('/sso/email/send', authController.sendSsoEmailCode);
router.post('/sso/email/verify', authController.verifySsoEmailCode);
router.post('/check-email', authController.checkEmail);
router.post('/reset-password', authController.resetPassword);
router.post('/register', authController.register);
router.get('/google', authController.startGoogleOAuth);
router.get('/google/callback', authController.handleGoogleOAuthCallback);
router.get('/naver', authController.startNaverOAuth);
router.get('/naver/callback', authController.handleNaverOAuthCallback);
router.get('/kakao', authController.startKakaoOAuth);
router.get('/kakao/callback', authController.handleKakaoOAuthCallback);
router.post('/login', authController.login);
router.post('/change-password', requireAuth, authController.changePassword);

export default router;

