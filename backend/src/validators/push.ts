import { z } from 'zod';

/**
 * تسجيل جهاز للإشعارات الفورية.
 *
 * [CRITICAL] لا حقل `userId` هنا ولن يوجد. صاحبُ الرمز يُؤخذ من سياق
 * المصادقة (`req.auth!.id`)؛ قبولُه من الجسم كان سيسمح لأي مستخدم مسجَّل
 * بتسجيل جهازه باسم غيره فيستقبل إشعارات ذلك الغير.
 */
export const registerDeviceSchema = z.object({
  // الحدّ الأعلى يطابق قيد القاعدة: رموز FCM طويلة (~١٦٣ حرفاً اليوم) وقد
  // تطول، لكن بلا سقف يصير الحقل باباً لحمولة بلا نهاية.
  token: z.string().trim().min(8, 'رمز الجهاز قصير جداً').max(4096),
  platform: z.enum(['android', 'ios', 'web']),
});

export const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(8).max(4096),
});
