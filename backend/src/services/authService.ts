import bcrypt from 'bcryptjs';
import type { AppLocale } from '../utils/locale.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { mediaRepo } from '../repositories/mediaRepo.js';
import { userRepo, toPublicUser, type UserRow } from '../repositories/userRepo.js';
import type { AuthUser, Gender, PublicUser } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { accountRequestRepo } from '../repositories/accountRequestRepo.js';
import { findLevel } from '../domain/galaxyPoints.js';

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
 * الصورة الشخصية يجب أن تكون ملفاً **رفعه هذا المستخدم** عبر `POST /api/uploads`.
 *
 * قَبولُ أي رابط خارجي كان يحوّل الحقل إلى قناة تتبّع: يضع المستخدم رابط
 * خادم يملكه، فيصير كل عرضٍ لصورته تسريباً لعنوان المُشاهِد وبصمة متصفحه
 * إلى طرف ثالث — ويصلح الحقل نفسه لاستضافة محتوى متغيّر بعد الحفظ.
 *
 * [SECURITY] والوجودُ في `media_files` وحده لا يكفي: صورةُ زبونٍ آخر
 * (في المجتمع مثلاً) موجودةٌ في الجدول وليست ملكاً للسائل. الشرط
 * `uploaded_by = السائل`. القيمة الحالية نفسها تمرّ بلا فحص — تطبيقٌ يعيد
 * إرسال الصورة القائمة مع تعديل الاسم لا يجوز أن يُرفض لأن صفّها فقد
 * رافعَه لاحقاً.
 */
async function assertOwnedAvatar(
  user: { id: string; avatar_url: string | null },
  avatarUrl: string | null | undefined,
) {
  if (avatarUrl === undefined) return undefined;
  if (avatarUrl === null) return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;
  if (trimmed === user.avatar_url) return trimmed;

  const media = await mediaRepo.findByUrl(db, trimmed);
  if (!media || media.uploaded_by !== user.id) {
    throw Errors.badRequest('صورة الملف الشخصي غير صالحة — أعد رفعها', 'INVALID_AVATAR_URL');
  }
  return trimmed;
}

export const authService = {
  /**
   * إنشاء حساب — طلبٌ تحسمه الإدارة، لا رمزٌ يُرسل.
   *
   * ═══ القرار ═══ لا SMS ولا بريد. الزبون يملأ الاستمارة نفسها كما كانت
   * (الاسم، الرقم، كلمة المرور، الجنس)، والخادم:
   *   ١. ينشئ صفّ `users` **غير مفعَّل** (`phone_verified_at IS NULL`) يحمل
   *      تجزئة كلمة المرور — الآلية القائمة أصلاً للحساب المعلَّق، وبوّابة
   *      الدخول ترفضه حتى تفعّله الإدارة.
   *   ٢. ينشئ طلب `registration` معلَّقاً تراه اللوحة.
   * الإدارة تتحقّق عبر واتساب يدوياً ثم توافق (`adminService.approveAccountRequest`)
   * فيُفعَّل الحساب — أو ترفض فيبقى الطلب في السجل.
   *
   * [CRITICAL] الرقم المسجَّل بلا تفعيل **ليس** رقماً مأخوذاً: إعادة التسجيل
   * تستأنف الصفّ المعلَّق (تحدّث الاسم والجنس وكلمة المرور) وتستأنف الطلب
   * المعلَّق بدل أن تكدّس نسخاً. الرقم المفعَّل وحده هو المأخوذ.
   */
  async register(input: {
    username: string;
    phone: string;
    password: string;
    gender: Gender;
  }) {
    const existing = await userRepo.findByPhone(db, input.phone);
    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

    if (existing && existing.phone_verified_at !== null) {
      throw Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول', 'PHONE_TAKEN');
    }

    // [CRITICAL] الصفّ المعلَّق وطلبه وحدةٌ واحدة (CA-9). كانا كتابتين
    // منفصلتين، فعطلٌ بينهما يترك حساباً غير مفعَّل بلا طلب: اللوحة لا تراه،
    // والدخول يقول للزبون «بانتظار موافقة الإدارة» عن طلبٍ لا يراه أحد. وفي
    // الاستئناف كان يُكتب الاسم وكلمة المرور الجديدان بلا طلبٍ يحملهما.
    // التجزئة قبل المعاملة عمداً — لا عمل حسابيّ ثقيل داخل قفل.
    const { user, request } = await withTransaction(async (tx) => {
      // زيادة نسخة التوكن تُبطل أي توكن قد يكون صدر لمحاولةٍ مهجورة قبل أن
      // يملكها شخص آخر.
      const written: UserRow = existing
        ? await userRepo.update(tx, existing.id, {
          username: input.username,
          gender: input.gender,
          passwordHash,
          bumpTokenVersion: true,
        })
        : await userRepo.create(tx, {
          username: input.username,
          phone: input.phone,
          passwordHash,
          gender: input.gender,
        });

      const pending = await accountRequestRepo.upsertPending(tx, {
        kind: 'registration',
        userId: written.id,
        submittedPhone: written.phone,
        submittedUsername: input.username,
        submittedGender: input.gender,
      });
      return { user: written, request: pending };
    });

    // لا جلسة ولا توكن: الحساب لا يُصادَق قبل موافقة الإدارة.
    return {
      user: toPublicUser(user),
      request: { id: request.id, status: request.status, createdAt: request.created_at.toISOString() },
    };
  },

  async login(phone: string, password: string): Promise<AuthResult> {
    const user = await userRepo.findByPhone(db, phone);
    if (!user) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw Errors.unauthorized('رقم الهاتف أو كلمة المرور غير صحيحة');

    if (!user.is_active) throw Errors.forbidden('الحساب موقوف — تواصل مع الدعم', 'ACCOUNT_SUSPENDED');

    // بوّابة التفعيل: كلمة مرور صحيحة لحساب لم توافق عليه الإدارة لا تفتح
    // جلسة. الرسالة تفرّق بين «معلَّق» و«مرفوض» ليعرف الزبون أين يقف — لكن
    // لا شيء هنا يُفعِّل الحساب: التفعيل قرار اللوحة وحدها.
    if (user.phone_verified_at === null) {
      const latest = await accountRequestRepo.findLatest(db, 'registration', user.phone);
      if (latest?.status === 'rejected') {
        throw Errors.forbidden('تم رفض طلب إنشاء الحساب — تواصل مع الإدارة', 'ACCOUNT_REQUEST_REJECTED');
      }
      throw Errors.forbidden('حسابك بانتظار موافقة الإدارة — سنتواصل معك عبر واتساب', 'ACCOUNT_PENDING_APPROVAL');
    }

    return { token: signToken(user), user: toPublicUser(user) };
  },

  /**
   * نسيت كلمة المرور — طلبٌ للإدارة لا رمزٌ للزبون.
   *
   * الزبون يرسل الرقم والاسم والجنس ومستوى حسابه. هذه **معلومات تعريف
   * للمسؤول** يقارنها بالمخزَّن ليحكم إن كان الطالب صاحبَ الحساب فعلاً —
   * وليست مصادقة: تطابقُها كاملاً **لا** يغيّر كلمة المرور ولا يفتح جلسة.
   * الإدارة تتحقّق عبر واتساب ثم تضع كلمة مرور جديدة **دائمة** من اللوحة
   * (`adminService.setCustomerPassword`) وتبلّغها الزبون، فيدخل بها عادياً.
   *
   * [CRITICAL] الردّ واحد وُجد الرقم أم لا: طلبٌ يُنشأ في الحالتين، والحساب
   * يُربط في القاعدة فقط إن وُجد (`user_id`)، فلا تصير النقطة أداةَ تعداد
   * لأرقام المسجَّلين. رقمٌ بلا حساب يصل اللوحة بلا حساب مرتبط فتُرفضه.
   */
  async forgotPassword(input: {
    phone: string;
    username: string;
    gender: Gender;
    levelKey: string;
  }) {
    // مفتاح المستوى يُقبل فقط إن كان من السلّم — لا نصٌّ حرّ يُخزَّن.
    if (!findLevel(input.levelKey)) {
      throw Errors.badRequest('مستوى غير معروف', 'UNKNOWN_LEVEL');
    }
    const user = await userRepo.findByPhone(db, input.phone);
    const request = await accountRequestRepo.upsertPending(db, {
      kind: 'password_reset',
      // حساب موقوف لا يُربط: الإدارة تراه بلا حساب وتقرّر.
      userId: user && user.is_active ? user.id : null,
      submittedPhone: input.phone,
      submittedUsername: input.username,
      submittedGender: input.gender,
      submittedLevelKey: input.levelKey,
    });
    return {
      request: { id: request.id, status: request.status, createdAt: request.created_at.toISOString() },
    };
  },

  async me(auth: AuthUser): Promise<PublicUser> {
    const user = await userRepo.findById(db, auth.id);
    if (!user || !user.is_active) throw Errors.unauthorized('الحساب غير موجود أو موقوف');
    return toPublicUser(user);
  },

  async updateProfile(
    auth: AuthUser,
    input: {
      username?: string;
      avatarUrl?: string | null;
      gender?: Gender;
      preferredLanguage?: AppLocale;
    },
  ) {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    const avatarUrl = await assertOwnedAvatar(user, input.avatarUrl);
    const updated = await userRepo.update(db, auth.id, {
      username: input.username,
      avatarUrl,
      gender: input.gender,
      preferredLanguage: input.preferredLanguage,
    });
    return toPublicUser(updated);
  },

  /** تغيير كلمة المرور من الإعدادات — يتحقق من الحالية دون رمز تحقق (مسجَّل دخوله بالفعل). */
  async changePassword(auth: AuthUser, currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await userRepo.findById(db, auth.id);
    if (!user) throw Errors.unauthorized('الحساب غير موجود');
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    // [CRITICAL] 400 لا 401. كلمة حالية خاطئة خطأُ إدخالٍ لا رفضُ توكن: التطبيق
    // يُنهي الجلسة عند 401 لأن 401 يعني «التوكن مرفوض»، فكان خطأٌ مطبعي في
    // هذا الحقل يُخرج صاحب الحساب من التطبيق كله. الرمز الخاص يميّزه لأي
    // عميل يقرأ الرمز لا الحالة.
    if (!ok) throw Errors.badRequest('كلمة المرور الحالية غير صحيحة', 'INVALID_CURRENT_PASSWORD');
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    const updated = await userRepo.update(db, user.id, { passwordHash, bumpTokenVersion: true });

    // الجلسات الأخرى تسقط بزيادة النسخة؛ نُعيد توكناً جديداً لهذا الجهاز
    // كي لا يُطرَد صاحبُ الطلب نفسه من التطبيق بعد نجاح العملية.
    return { token: signToken(updated), user: toPublicUser(updated) };
  },
};
