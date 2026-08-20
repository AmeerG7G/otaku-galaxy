import { z } from 'zod';

/** رقم هاتف عراقي: يبدأ بـ 07 ويتبعه 9 أرقام. */
const phone = z
  .string()
  .regex(/^07\d{9}$/, 'رقم الهاتف غير صالح (يجب أن يبدأ بـ 07 ويتركب من 11 رقماً)');

const password = z
  .string()
  .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
  .max(72, 'كلمة المرور طويلة جداً');

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'اسم المستخدم قصير جداً')
    .max(40, 'اسم المستخدم طويل جداً'),
  phone,
  password,
});

export const verifySchema = z.object({
  phone,
  code: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام'),
});

export const loginSchema = z.object({ phone, password });

export const forgotPasswordSchema = z.object({ phone });

export const resetPasswordSchema = z.object({
  phone,
  code: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام'),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  username: z.string().trim().min(2).max(40).optional(),
  avatarUrl: z.string().url('رابط صورة غير صالح').nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;