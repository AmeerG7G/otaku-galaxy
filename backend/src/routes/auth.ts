import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import {
  authRateLimiter,
  loginRateLimiter,
  otpSendRateLimiter,
  otpVerifyRateLimiter,
} from '../middleware/error-handler.js';

export const authRoutes = Router();

/**
 * لكل غرض دلوه.
 *
 * كانت النقاط الستّ تتقاسم نسخةً واحدة من الحدّ (10 طلبات/15 دقيقة لكل IP)،
 * فرحلةُ تسجيلٍ واحدة تستهلك نصفه ثم يُرفض *تسجيل الدخول* أيضاً بـ429.
 * الفصل هنا يجعل استهلاك مسارٍ لا يُغلق مساراً آخر.
 */
const floodGuard = authRateLimiter();

authRoutes.post('/register', floodGuard, otpSendRateLimiter(), authController.register);
authRoutes.post('/verify', floodGuard, otpVerifyRateLimiter(), authController.verify);
authRoutes.post('/resend-code', floodGuard, otpSendRateLimiter(), authController.resendCode);
authRoutes.post('/login', floodGuard, loginRateLimiter(), authController.login);
authRoutes.post('/forgot-password', floodGuard, otpSendRateLimiter(), authController.forgotPassword);
authRoutes.post('/reset-password', floodGuard, otpVerifyRateLimiter(), authController.resetPassword);

authRoutes.get('/me', authenticate, authController.me);
authRoutes.patch('/me', authenticate, authController.updateProfile);
authRoutes.patch('/me/password', authenticate, authController.changePassword);
