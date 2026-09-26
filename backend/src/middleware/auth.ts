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
 * `sub` يجب أن يكون UUID قبل أن يلمس القاعدة.
 *
 * [SECURITY] توكنٌ موقَّع توقيعاً صحيحاً لكن `sub` فيه ليس UUID كان يصل إلى
 * `findAuthState` فيرمي PostgreSQL خطأ نوع (`22P02`) ويخرج الطلب ٥٠٠ مع
 * كومة استدعاء في السجل — بدل ٤٠١ «رمز غير صالح». لا يفتح ذلك باباً (لا
 * جلسة بلا صفّ)، لكن الرمز المشوَّه يجب أن يفشل كرمزٍ لا كعطلِ خادم.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUserId(sub: unknown): sub is string {
  return typeof sub === 'string' && UUID_PATTERN.test(sub);
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
  // مسارات الإدارة تمرّ من طبقة `/api` (وفيها هذا الوسيط) ثم من طبقة
  // `/api/admin` (وفيها هو نفسه)، فكان كل طلبٍ إداري يقرأ حالة الحساب
  // مرتين. `req.auth` لا يضعه إلا هذا الوسيط أو `optionalAuthenticate`
  // بالفحوص نفسها — وجوده يعني أن الطلب اجتازها في هذه الدورة.
  if (req.auth) return next();

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

  if (!isUserId(payload.sub) || !payload.role) {
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
    // [I18N] اللغة تُقرأ من الصفّ لا من التوكن: تبديلُها في الإعدادات يسري
    // على الطلب التالي مباشرةً، بلا انتظار انتهاء توكنٍ عمرُه سبعة أيام.
    req.auth = {
      id: state.id,
      role: state.role,
      phone: state.phone,
      locale: state.locale,
    };
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

/**
 * مصادقة **اختيارية** — للمسارات العامة التي يتغيّر ردّها بهوية القارئ.
 *
 * [CRITICAL] الكتالوج عام: يقرؤه الزائر قبل التسجيل، فلا يجوز أن يرفض.
 * لكن الزبون المسجَّل الذي اختار الكردية يجب أن يقرأ الكردية، وتفضيلُه في
 * صفّه لا في ترويسته. بلا هذا الوسيط كان `req.auth` غير معرَّف على
 * `/api/catalog` مهما أرسل التطبيق توكناً، فيسقط كل شيء إلى `Accept-Language`
 * وحدها — ويقرأ من اختار الكردية في الإعدادات عربيةً في صفحة المنتج.
 *
 * أي خلل في التوكن (منتهٍ، مبطَل، حساب موقوف) يُتجاهَل بصمت هنا: المسار عام
 * أصلاً، ورفضُ زائرٍ بسبب توكن قديم في جهازه سلوكٌ أسوأ من خدمته كزائر.
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    if (!isUserId(payload.sub)) return next();

    const state = await userRepo.findAuthState(db, payload.sub);
    if (!state || !state.isActive) return next();

    const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    if (tokenVersion !== state.tokenVersion) return next();

    req.auth = {
      id: state.id,
      role: state.role,
      phone: state.phone,
      locale: state.locale,
    };
  } catch {
    // توكن غير صالح على مسار عام — يُخدَم زائراً.
  }
  return next();
}
