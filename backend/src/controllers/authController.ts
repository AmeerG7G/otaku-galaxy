import type { RequestHandler } from 'express';
import { authService } from '../services/authService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.js';

export const authController = {
  register: (async (req, res) => {
    const input = parse(registerSchema, req.body);
    const result = await authService.register(input);
    // 202 لا 201: أُنشئ طلبٌ ينتظر قراراً، لا حسابٌ جاهز.
    return ok(res, result, 'استلمنا طلبك — ستتواصل معك الإدارة عبر واتساب لتأكيد إنشاء الحساب', 202);
  }) as RequestHandler,

  login: (async (req, res) => {
    const input = parse(loginSchema, req.body);
    const result = await authService.login(input.phone, input.password);
    return ok(res, result, 'تم تسجيل الدخول');
  }) as RequestHandler,

  forgotPassword: (async (req, res) => {
    const input = parse(forgotPasswordSchema, req.body);
    const result = await authService.forgotPassword(input);
    return ok(res, result, 'استلمنا طلبك — ستتواصل معك الإدارة عبر واتساب لإعادة تعيين كلمة المرور', 202);
  }) as RequestHandler,

  me: (async (req, res) => {
    const user = await authService.me(req.auth!);
    return ok(res, { user });
  }) as RequestHandler,

  updateProfile: (async (req, res) => {
    const input = parse(updateProfileSchema, req.body);
    const user = await authService.updateProfile(req.auth!, input);
    return ok(res, { user });
  }) as RequestHandler,

  changePassword: (async (req, res) => {
    const input = parse(changePasswordSchema, req.body);
    // تغيير كلمة المرور يُبطل الجلسات السابقة، فيُعاد توكن جديد لهذا الجهاز
    // كي لا يخرج صاحبُ الطلب من التطبيق فور نجاح العملية.
    const result = await authService.changePassword(
      req.auth!,
      input.currentPassword,
      input.newPassword,
    );
    return ok(res, result, 'تم تغيير كلمة المرور بنجاح');
  }) as RequestHandler,
};