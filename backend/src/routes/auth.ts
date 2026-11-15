import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { whatsappSignupController } from '../controllers/whatsappSignupController.js';
import {
  accountDeletionRateLimiter,
  accountRequestRateLimiter,
  authRateLimiter,
  loginRateLimiter,
  whatsappSignupFloodLimiter,
  whatsappStatusRateLimiter,
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

/**
 * التحقق التلقائي عبر واتساب (`WHATSAPP_VERIFY_MODE`) — مسارٌ **إضافي**. ما فوقه
 * (`/register` تحسمه الإدارة) باقٍ كما هو في الوضعين وهو البديل دائماً. في الوضع
 * `off` تردّ هذه النقاط ٤٠٤ وتقول الخيارات `enabled: false`.
 */
// قراءةُ إعدادٍ عامّ تفتحها كل شاشة تسجيل — خارج `floodGuard` عمداً: ذلك الدلو
// (لكل عنوان) يحرس الدخول، وخلف NAT المشغّل كانت فتحاتُ الشاشة تستهلكه. يبقى
// تحت الحدّ العامّ للتطبيق (`globalRateLimiter`).
authRoutes.get('/registration-options', whatsappSignupController.options);
// [STEP 85] دلو فيضانٍ خاصّ بواتساب، لا `floodGuard` الذي يحرس الدخول: زبائن خلف
// عنوانٍ واحد كانوا يُحجبون عنده (٦٠/١٥ دقيقة) قبل حدود القاعدة، ويستهلكون حدّ
// دخول جيرانهم. الحدود الحقيقية في القاعدة (`whatsappSignupService.start`).
const whatsappFlood = whatsappSignupFloodLimiter();
authRoutes.post('/register/whatsapp/start', whatsappFlood, accountRequestRateLimiter(), whatsappSignupController.start);
authRoutes.post('/register/whatsapp/status', whatsappStatusRateLimiter(), whatsappSignupController.status);
authRoutes.post('/register/whatsapp/complete', whatsappFlood, whatsappSignupController.complete);

authRoutes.get('/me', authenticate, authController.me);
authRoutes.patch('/me', authenticate, authController.updateProfile);
authRoutes.patch('/me/password', authenticate, authController.changePassword);
// [STEP 78] حذف الحساب بطلب صاحبه — جلسةٌ وكلمة المرور الآن، وسقفٌ بالحساب.
authRoutes.post('/me/delete', authenticate, accountDeletionRateLimiter(), authController.deleteAccount);
