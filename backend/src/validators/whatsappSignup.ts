import { z } from 'zod';
import { whatsappSignupFields } from './auth.js';

/**
 * مدخلات التحقق عبر واتساب — الحقول نفسها التي يتحقّق منها التسجيل العادي
 * (الرقم العراقي المطبَّع، الاسم، الجنس، سياسة كلمة المرور)، لا نسخٌ موازية.
 */
const { phone, username, gender, newPassword } = whatsappSignupFields;

const sessionId = z.string().uuid('جلسة التحقق غير موجودة — ابدأ من جديد');
/** ٣٢ بايتاً بترميز base64url = ٤٣ محرفاً. */
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'جلسة التحقق غير موجودة — ابدأ من جديد');

export const whatsappStartSchema = z.object({ phone });
export const whatsappStatusSchema = z.object({ sessionId, secret });
export const whatsappCompleteSchema = z.object({
  sessionId,
  secret,
  username,
  gender,
  password: newPassword,
});
