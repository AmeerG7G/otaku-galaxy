import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { userRepo, toPublicUser, type UserRow } from '../repositories/userRepo.js';
import type { AuthUser, PublicUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { sendVerificationCode, verifyCode } from './otpService.js';

export interface AuthResult {
  token: string;
  user: PublicUser;
}

function signToken(user: UserRow): string {
  // `tv` هو مفتاح الإبطال: يقارنه وسيط المصادقة بنسخة الصف في كل طلب.
  const payload = { sub: user.id, role: user.role, phone: user.phone, tv: user.token_version };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * الصورة الشخصية يجب أن تكون ملفاً رفعه المستخدم عبر `POST /api/uploads`.
 *
 * قَبولُ أي رابط خارجي كان يحوّل الحقل إلى قناة تتبّع: يضع المستخدم رابط
 * خادم يملكه، فيصير كل عرضٍ لصورته تسريباً لعنوان المُشاهِد وبصمة متصفحه
 * إلى طرف ثالث — ويصلح الحقل نفسه لاستضافة محتوى متغيّر بعد الحفظ.
 * القاعدة هنا نفس قاعدة صور التقييمات: مرجعٌ نعرفه في `media_files` أو لا شيء.
 */
async function assertOwnedAvatar(avatarUrl: string | null | undefined) {
  if (avatarUrl === undefined) return undefined;
  if (avatarUrl === null) return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  const media = await mediaRepo.findByUrl(db, trimmed);
  if (!media) {
    throw Errors.badRequest('صورة الملف الشخصي غير صالحة — أعد رفعها', 'INVALID_AVATAR_URL');
  }
  return trimmed;
}

export const authService = {
  /**
   * إنشاء حساب — أو استئناف تسجيل لم يكتمل.
   *
   * [CRITICAL] الرقم المسجَّل بلا تحقق **ليس** رقماً مأخوذاً.
   *
   * كان الصفّ يُنشأ عند التسجيل ثم يُرفض أي تسجيل لاحق بنفس الرقم بـ409.
   * فمن انقطعت عنه الرسالة أو أغلق التطبيق قبل إدخال الرمز يبقى محبوساً
   * إلى الأبد: لا يستطيع إكمال التسجيل ولا إعادته — وهذا هو عرض «لا أستطيع
   * إنشاء حساب جديد». الآن التسجيل على حساب غير محقَّق يستأنفه: يحدّث الاسم
   * وكلمة المرور ويرسل رمزاً جديداً. الرقم المحقَّق وحده هو المأخوذ فعلاً.
   */
  async register(input: { username: string; phone: string; password: string }) {
    const existing = await userRepo.findByPhone(db, input.phone);
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

    if (existing) {
      if (existing.phone_verified_at !== null) {
        throw Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول', 'PHONE_TAKEN');
      }
      // حساب معلّق: نُحدّثه بدل رفضه. زيادة نسخة التوكن تُبطل أي توكن قد
      // يكون صدر لهذه المحاولة المهجورة قبل أن يملكها شخص آخر.
      const updated = await userRepo.update(db, existing.id, {
        username: input.username,
        passwordHash,
        bumpTokenVersion: true,
      });
      await sendVerificationCode(db, input.phone, 'register');
      return { user: toPublicUser(updated) };
    }

    const user = await userRepo.create(db, {
      username: input.username,
      phone: input.phone,
      passwordHash,
    });
    await sendVerificationCode(db, input.phone, 'register');
    return { user: toPublicUser(user) };
  },

  /**
   * التحقق من رمز التسجيل — يثبّت حالة «محقَّق» ويعيد جلسة جاهزة.
   *
   * التحقق يثبت ملكية الرقم، فلا معنى لمطالبة المستخدم بتسجيل الدخول يدوياً
   * بعده؛ إرجاع الجلسة هنا يجعله مصادَقاً فور إتمام التحقق.
   */
  async verifyRegistration(phone: string, code: string): Promise<AuthResult> {
    await verifyCode(db, phone, 'register', code);
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.badRequest('تعذّر إتمام التحقق — أعد التسجيل', 'REGISTRATION_MISSING');
    if (!user.is_active) throw Errors.forbidden('الحساب موقوف — تواصل مع الدعم', 'ACCOUNT_SUSPENDED');

    // الحساب يصير محقَّقاً هنا فقط — لا عند إنشائه.
    const verified = user.phone_verified_at
      ? user
      : await userRepo.update(db, user.id, { phoneVerifiedAt: new Date() });

    return { token: signToken(verified), user: toPublicUser(verified) };
  },

  /**
   * إعادة إرسال رمز التسجيل.
   *
   * الردّ واحد سواء وُجد الرقم أم لا: ردٌّ مختلف لكل حالة يحوّل النقطة إلى
   * أداة تعداد أرقام المسجَّلين لدى المتجر. الحدّ الزمني للإرسال يُطبَّق في
   * `otpService` على الرقم نفسه.
   */
  async resendCode(phone: string) {
    const user = await userRepo.findByPhone(db, phone);
    // لا رمز لحساب غير موجود أو محقَّق سلفاً — لكن الردّ لا يفرّق.
    if (!user || user.phone_verified_at !== null) return;
    if (!user.is_active) return;
    await sendVerificationCode(db, phone, 'register');
  },

  async login(phone: string, password: string): Promise<AuthResult> {
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');

    if (!user.is_active) throw Errors.forbidden('الحساب موقوف — تواصل مع الدعم', 'ACCOUNT_SUSPENDED');

    // بوابة التحقق: كلمة مرور صحيحة لحساب لم يُثبت ملكية رقمه لا تفتح جلسة.
    // الرمز يُرسَل هنا حتى يكمل المستخدم رحلته بدل أن يعلق أمام رفضٍ مبهم.
    if (user.phone_verified_at === null) {
      await sendVerificationCode(db, phone, 'register').catch(() => undefined);
      throw Errors.forbidden('أكمل تفعيل رقمك أولاً — أرسلنا رمزاً جديداً', 'PHONE_NOT_VERIFIED');
    }

    return { token: signToken(user), user: toPublicUser(user) };
  },

  /** الردّ لا يكشف وجود الرقم — انظر التعليق على `resendCode`. */
  async forgotPassword(phone: string) {
    const user = await userRepo.findByPhone(db, phone);
    if (!user || !user.is_active) return;
    await sendVerificationCode(db, phone, 'password_reset');
  },

  async resetPassword(phone: string, code: string, newPassword: string) {
    await verifyCode(db, phone, 'password_reset', code);
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.badRequest('تعذّر تحديث كلمة المرور', 'RESET_FAILED');
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    // تغيير كلمة المرور يُبطل كل الجلسات السابقة: من استعاد حسابه بعد
    // اختراقه يجب ألا يبقى للمخترق توكنٌ صالح.
    await userRepo.update(db, user.id, { passwordHash, bumpTokenVersion: true });
  },

  async me(auth: AuthUser): Promise<PublicUser> {
    const user = await userRepo.findById(db, auth.id);
    if (!user || !user.is_active) throw Errors.unauthorized('الحساب غير موجود أو موقوف');
    return toPublicUser(user);
  },

  async updateProfile(auth: AuthUser, input: { username?: string; avatarUrl?: string | null }) {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    const avatarUrl = await assertOwnedAvatar(input.avatarUrl);
    const updated = await userRepo.update(db, auth.id, {
      username: input.username,
      avatarUrl,
    });
    return toPublicUser(updated);
  },

  /** تغيير كلمة المرور من الإعدادات — يتحقق من الحالية دون رمز تحقق (مسجَّل دخوله بالفعل). */
  async changePassword(auth: AuthUser, currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) throw Errors.unauthorized('كلمة المرور الحالية غير صحيحة');
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    const updated = await userRepo.update(db, user.id, { passwordHash, bumpTokenVersion: true });

    // الجلسات الأخرى تسقط بزيادة النسخة؛ نُعيد توكناً جديداً لهذا الجهاز
    // كي لا يُطرَد صاحبُ الطلب نفسه من التطبيق بعد نجاح العملية.
    return { token: signToken(updated), user: toPublicUser(updated) };
  },
};
