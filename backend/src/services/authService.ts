import bcrypt from 'bcryptjs';
import type pg from 'pg';
import type { AppLocale } from '../utils/locale.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { adminEvents } from './adminEvents.js';
import { adminPushRepo } from '../repositories/adminPushRepo.js';
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

export function signToken(user: UserRow): string {
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
   * تستأنف الطلب المعلَّق بدل أن تكدّس نسخاً، وتُحدّث ما **أرسله** الطالب في
   * الطلب ليراه المسؤول. الرقم المفعَّل وحده هو المأخوذ.
   *
   * [SECURITY] ما دام للرقم طلبٌ **معلَّق**، فالاستئناف **لا يمسّ كلمة مرور**
   * الحساب. كان يكتب كلمة المرور الجديدة فوق الأولى، فمن يعرف رقم شخصٍ ينتظر
   * الموافقة يعيد التسجيل بكلمته هو، ثم يتحقّق المسؤول عبر واتساب من صاحب
   * الرقم الحقيقي ويوافق — فيُفعَّل الحساب بكلمة المهاجم. الآن تُفعِّل الموافقةُ
   * كلمةَ صاحب الطلب المعلَّق. الاسم والجنس (بياناتٌ لا اعتماد) يُحدَّثان كما
   * كانا، ويعدّلهما صاحب الحساب بعد الدخول إن شاء. من نسي كلمته قبل الموافقة
   * يطلب إعادة تعيين من «نسيت كلمة المرور».
   *
   * بلا طلبٍ معلَّق (رُفض الطلب السابق، أو صفٌّ قديم بلا طلب) فهذا تسجيلٌ
   * جديد على صفٍّ غير مفعَّل: تُكتب بياناته كما أُرسلت، ويُفتح طلبٌ جديد.
   */
  async register(input: {
    username: string;
    phone: string;
    password: string;
    gender: Gender;
  }) {
    const existing = await userRepo.findByPhone(db, input.phone);

    if (existing && existing.phone_verified_at !== null) {
      throw Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول', 'PHONE_TAKEN');
    }

    const hasPendingRequest = async (client: pg.Pool | pg.PoolClient, phone: string) =>
      (await accountRequestRepo.findLatest(client, 'registration', phone))?.status === 'pending';

    // التجزئة قبل المعاملة عمداً (لا عمل حسابيّ ثقيل داخل قفل)، وبعد
    // الفحوص: الرقم المأخوذ واستئناف المعلَّق لا يكتبان كلمة مرور، فلا تُستهلك
    // عليهما دورة bcrypt.
    const resumesPending = existing !== null && (await hasPendingRequest(db, existing.phone));
    const passwordHash = resumesPending
      ? null
      : await bcrypt.hash(input.password, config.bcryptRounds);

    // [CRITICAL] الصفّ المعلَّق وطلبه وحدةٌ واحدة (CA-9). كانا كتابتين
    // منفصلتين، فعطلٌ بينهما يترك حساباً غير مفعَّل بلا طلب: اللوحة لا تراه،
    // والدخول يقول للزبون «بانتظار موافقة الإدارة» عن طلبٍ لا يراه أحد.
    const { user, request } = await withTransaction(async (tx) => {
      let written: UserRow;
      if (existing) {
        // [SECURITY] الحكم **كله** يُعاد تحت قفل الصفّ، لا من القراءتين قبله:
        //   • تفعيلٌ وقع بينهما (وافقت الإدارة): الرقم صار مأخوذاً. كان الطلب
        //     يمضي فيكتب كلمة مروره على حسابٍ مفعَّل — دخولٌ لمن لا يملكه.
        //   • طلبٌ معلَّق رُفض بينهما: هذا تسجيلٌ جديد بكلمة مروره هو. كان
        //     يُعامَل استئنافاً فيفتح طلباً جديداً على كلمة الطالب السابق.
        // وتسجيلان متزامنان لا يقرأ أحدهما «لا طلب معلَّق» بعد أن فتحه الآخر.
        const { rows } = await tx.query<{ phone_verified_at: Date | null }>(
          'SELECT phone_verified_at FROM users WHERE id = $1 FOR UPDATE',
          [existing.id],
        );
        if (!rows[0] || rows[0].phone_verified_at !== null) {
          throw Errors.conflict('هذا الرقم مسجّل بالفعل — جرّب تسجيل الدخول', 'PHONE_TAKEN');
        }
        if (await hasPendingRequest(tx, existing.phone)) {
          // استئناف معلَّق: الاسم والجنس فقط — كلمة المرور لا تُمسّ (انظر
          // [SECURITY] أعلاه). زيادة النسخة كما كانت: لا توكن لحسابٍ معلَّق أصلاً.
          written = await userRepo.update(tx, existing.id, {
            username: input.username,
            gender: input.gender,
            bumpTokenVersion: true,
          });
        } else {
          // تسجيلٌ جديد على صفٍّ غير مفعَّل. زيادة نسخة التوكن تُبطل أي توكن
          // قد يكون صدر لمحاولةٍ سابقة. التجزئة هنا داخل القفل في حالةٍ واحدة
          // نادرة: ظُنّ استئنافاً قبل القفل ثم رُفض الطلب.
          written = await userRepo.update(tx, existing.id, {
            username: input.username,
            gender: input.gender,
            passwordHash: passwordHash ?? (await bcrypt.hash(input.password, config.bcryptRounds)),
            bumpTokenVersion: true,
          });
        }
      } else {
        written = await userRepo.create(tx, {
          username: input.username,
          phone: input.phone,
          passwordHash: passwordHash!,
          gender: input.gender,
        });
      }

      const pending = await accountRequestRepo.upsertPending(tx, {
        kind: 'registration',
        userId: written.id,
        submittedPhone: written.phone,
        submittedUsername: input.username,
        submittedGender: input.gender,
      });
      // تنبيه المسؤول بطلبٍ **جديد** فقط: استئناف طلبٍ معلَّق لا يرنّ ثانيةً.
      if (pending.inserted) {
        await adminEvents.accountRequest(tx, {
          id: pending.id,
          kind: 'registration',
          username: input.username,
          phone: written.phone,
        });
      }
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
    const request = await withTransaction(async (tx) => {
      const pending = await accountRequestRepo.upsertPending(tx, {
        kind: 'password_reset',
        // حساب موقوف لا يُربط: الإدارة تراه بلا حساب وتقرّر.
        userId: user && user.is_active ? user.id : null,
        submittedPhone: input.phone,
        submittedUsername: input.username,
        submittedGender: input.gender,
        submittedLevelKey: input.levelKey,
      });
      if (pending.inserted) {
        await adminEvents.accountRequest(tx, {
          id: pending.id,
          kind: 'password_reset',
          username: input.username,
          phone: input.phone,
        });
      }
      return pending;
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
    if (!user || user.role === 'deleted') throw Errors.unauthorized('الحساب غير موجود');
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
    if (!user || user.role === 'deleted') throw Errors.unauthorized('الحساب غير موجود');
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    // [CRITICAL] 400 لا 401. كلمة حالية خاطئة خطأُ إدخالٍ لا رفضُ توكن: التطبيق
    // يُنهي الجلسة عند 401 لأن 401 يعني «التوكن مرفوض»، فكان خطأٌ مطبعي في
    // هذا الحقل يُخرج صاحب الحساب من التطبيق كله. الرمز الخاص يميّزه لأي
    // عميل يقرأ الرمز لا الحالة.
    if (!ok) throw Errors.badRequest('كلمة المرور الحالية غير صحيحة', 'INVALID_CURRENT_PASSWORD');
    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    // [SECURITY] المسار مفتوحٌ للمسؤول أيضاً (الفرعي بلا قسم «المسؤولين» لا يملك
    // غيره). الجلسات تسقط بالنسخة، وأجهزة إشعار المسؤول معها في المعاملة نفسها —
    // كما في `adminAccountsService.updateOwn`: وإلا بقي متصفّحٌ سجّلته جلسةٌ
    // مُبطلة يستقبل بيانات الزبائن حتى انتهائها. الترتيب users ثم الأجهزة هو
    // ترتيب كل إبطالٍ آخر. للزبون لا صفوف هنا فلا أثر.
    const updated = await withTransaction(async (tx) => {
      const row = await userRepo.update(tx, user.id, { passwordHash, bumpTokenVersion: true });
      await adminPushRepo.deactivateAll(tx, user.id);
      return row;
    });

    // الجلسات الأخرى تسقط بزيادة النسخة؛ نُعيد توكناً جديداً لهذا الجهاز
    // كي لا يُطرَد صاحبُ الطلب نفسه من التطبيق بعد نجاح العملية.
    return { token: signToken(updated), user: toPublicUser(updated) };
  },
};
