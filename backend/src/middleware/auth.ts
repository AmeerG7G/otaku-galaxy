import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { userRepo } from '../repositories/userRepo.js';
import type { AuthUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
  }
}

/**
 * فحص JWT وحقن بيانات المستخدم في الطلب.
 *
 * [CRITICAL] التوقيع الصالح **ليس** إذناً كافياً.
 *
 * كان هذا الوسيط يكتفي بالتحقق من التوقيع، فيبقى توكنُ حسابٍ أوقفته الإدارة
 * صالحاً حتى انتهاء مدته (٧ أيام) على كل المسارات المحمية — السلة والطلبات
 * والتقييمات والنقاط. المسار الوحيد الذي كان يرفضه هو `/auth/me` لأنه يقرأ
 * القاعدة صدفةً. أي أن «إيقاف الحساب» في لوحة التحكم لم يكن يوقف شيئاً.
 *
 * الآن كل طلب محمي يقابل التوكن بحالة الصف: هل الحساب فعّال؟ وهل نسخة
 * التوكن ما تزال هي النسخة الحالية؟ الكلفة استعلام مفتاحٍ أساسي واحد —
 * ثمن زهيد مقابل أن يعني الإيقافُ الإيقافَ.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(Errors.unauthorized('مطلوب تسجيل الدخول'));
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
  } catch {
    return next(Errors.unauthorized('الرمز منتهي أو غير صالح'));
  }

  if (!payload.sub || typeof payload.sub !== 'string' || !payload.role) {
    return next(Errors.unauthorized('رمز غير صالح'));
  }

  try {
    const state = await userRepo.findAuthState(db, payload.sub);
    if (!state) {
      return next(Errors.unauthorized('الحساب غير موجود'));
    }
    if (!state.isActive) {
      return next(Errors.forbidden('الحساب موقوف — تواصل مع الدعم', 'ACCOUNT_SUSPENDED'));
    }

    // التوكنات القديمة (قبل إضافة الحقل) لا تحمل `tv`؛ نعاملها كالنسخة صفر
    // وهي القيمة الافتراضية في القاعدة، فلا تنقطع جلسة قائمة بلا سبب.
    const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    if (tokenVersion !== state.tokenVersion) {
      return next(Errors.unauthorized('انتهت صلاحية الجلسة — سجّل الدخول من جديد', 'SESSION_REVOKED'));
    }

    // الدور والرقم يُقرآن من القاعدة لا من التوكن: ترقيةُ أو تنزيلُ دور
    // يجب أن تسري فوراً، لا بعد أن يعيد المستخدم تسجيل الدخول.
    req.auth = { id: state.id, role: state.role, phone: state.phone };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** حماية مسارات الإدارة: يتطلب دور admin. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'admin') {
    return next(Errors.forbidden());
  }
  return next();
}
