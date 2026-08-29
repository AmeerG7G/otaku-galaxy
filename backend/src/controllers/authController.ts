import type { RequestHandler } from 'express';
import { authService } from '../services/authService.js';
import { ok } from '../utils/response.js';
import { parse } from '../utils/zod.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifySchema,
} from '../validators/auth.js';

export const authController = {
  register: (async (req, res) => {
    const input = parse(registerSchema, req.body);
    const result = await authService.register(input);
    return ok(res, result, 'تم إرسال رمز التحقق إلى هاتفك');
  }) as RequestHandler,

  verify: (async (req, res) => {
    const input = parse(verifySchema, req.body);
    const result = await authService.verifyRegistration(input.phone, input.code);
    // تُعاد الجلسة كما في تسجيل الدخول ليُصبح المستخدم مصادَقاً مباشرةً.
    return ok(res, result, 'تم التحقق بنجاح — أهلاً بك');
  }) as RequestHandler,

  resendCode: (async (req, res) => {
    const input = parse(registerSchema.pick({ phone: true }), req.body);
    await authService.resendCode(input.phone);
    return ok(res, null, 'أُعيد إرسال رمز التحقق');
  }) as RequestHandler,

  login: (async (req, res) => {
    const input = parse(loginSchema, req.body);
    const result = await authService.login(input.phone, input.password);
    return ok(res, result, 'تم تسجيل الدخول');
  }) as RequestHandler,

  forgotPassword: (async (req, res) => {
    const input = parse(forgotPasswordSchema, req.body);
    await authService.forgotPassword(input.phone);
    return ok(res, null, 'أُرسل رمز استعادة كلمة المرور إلى هاتفك');
  }) as RequestHandler,

  resetPassword: (async (req, res) => {
    const input = parse(resetPasswordSchema, req.body);
    await authService.resetPassword(input.phone, input.code, input.newPassword);
    return ok(res, null, 'تم تحديث كلمة المرور');
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