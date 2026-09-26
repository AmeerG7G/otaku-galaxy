import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import {
  accountRequestRateLimiter,
  authRateLimiter,
  loginRateLimiter,
} from '../middleware/error-handler.js';

export const authRoutes = Router();

/**
 * لكل غرض دلوه.
 *
 * كانت النقاط تتقاسم نسخةً واحدة من الحدّ (10 طلبات/15 دقيقة لكل IP)، فرحلةُ
 * تسجيلٍ واحدة تستهلك نصفه ثم يُرفض *تسجيل الدخول* أيضاً بـ429. الفصل هنا
 * يجعل استهلاك مسارٍ لا يُغلق مساراً آخر.
 *
 * ═══ ما لم يعد هنا ═══ `/verify` و`/resend-code` و`/reset-password`:
 * كانت مسارات رمز SMS. التسجيل ونسيان كلمة المرور صارا **طلبين** تحسمهما
 * الإدارة من اللوحة بعد تحقّق واتساب — انظر `authService` و
 * `routes/admin.ts` (`/account-requests`). لا مسار عام يفعّل حساباً أو
 * يغيّر كلمة مرور بلا جلسة.
 */
const floodGuard = authRateLimiter();

authRoutes.post('/register', floodGuard, accountRequestRateLimiter(), authController.register);
authRoutes.post('/login', floodGuard, loginRateLimiter(), authController.login);
authRoutes.post('/forgot-password', floodGuard, accountRequestRateLimiter(), authController.forgotPassword);

authRoutes.get('/me', authenticate, authController.me);
authRoutes.patch('/me', authenticate, authController.updateProfile);
authRoutes.patch('/me/password', authenticate, authController.changePassword);
