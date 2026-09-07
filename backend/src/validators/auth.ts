import { z } from 'zod';
import { GENDERS } from '../types/index.js';
import { normalizeIraqiPhone } from '../utils/phone.js';

/**
 * رقم الهاتف — يُتحقَّق منه ثم **يُحوَّل** إلى الصيغة المعتمدة.
 *
 * المخرَج دائماً `+9647XXXXXXXXX`، فكل ما بعد التحقق (الخدمات، القاعدة،
 * مزوّد الرسائل) يتعامل مع تمثيل واحد لا غير. المستخدم يبقى حراً في كتابة
 * `07…` أو `+964…` أو `00964…` — التطبيع مسؤولية الخادم لا مسؤوليته.
 */
const phone = z
  .string()
  .refine((v) => normalizeIraqiPhone(v) !== null, {
    message: 'رقم الهاتف غير صالح — أدخل رقم موبايل عراقي مثل 07XXXXXXXXX',
  })
  .transform((v) => normalizeIraqiPhone(v)!);

/**
 * سياسة كلمة المرور عند **الضبط** (تسجيل، إعادة تعيين، تغيير).
 *
 * الحدّ الأدنى ثمانية. الحدّ الأعلى ٧٢ **بايتاً** لا حرفاً: bcrypt يتوقّف
 * عند ٧٢ بايتاً ويتجاهل ما بعدها بصمت، والحرف العربي بايتان في UTF-8 — أي
 * أن عبارة مرور عربية من ٤٠ حرفاً كانت تُقتطع دون أن يعلم صاحبها، فيظنّ
 * نفسه محمياً بما لم يُحسب أصلاً. الرفض الصريح أصدق من الاقتطاع الصامت.
 *
 * لا قواعد تعقيد (رمز/رقم/حرف كبير): تدفع المستخدمين إلى أنماط متوقَّعة
 * وتمنع عبارات المرور الطويلة، فتُنقص الأمان بدل أن تزيده.
 */
const MAX_PASSWORD_BYTES = 72;

const newPassword = z
  .string()
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: 'كلمة المرور طويلة جداً',
  });

/**
 * كلمة المرور عند **الدخول** — تُقبل كما هي.
 *
 * [CRITICAL] لا يجوز تطبيق الحدّ الأدنى الجديد هنا. حسابات أُنشئت أيام
 * الحدّ القديم (ستة أحرف) ما تزال قائمة، وفرضُ الثمانية على الدخول كان
 * سيقفل أصحابها خارج حساباتهم بلا أي إشعار ولا مسار استرجاع — تشديدُ
 * سياسةٍ يجب أن يسري على ما يُضبط لاحقاً لا على ما ضُبط سلفاً.
 */
const loginPassword = z
  .string()
  .min(1, 'أدخل كلمة المرور')
  .max(200, 'كلمة المرور طويلة جداً');

/**
 * الأسماء: عربية وإنجليزية وأي نصّ يونيكود مشروع.
 *
 * لا قيد ASCII — الاسم العربي هو الحالة الغالبة هنا لا الاستثناء. المرفوض
 * هو محارف التحكّم ومحارف التنسيق غير المرئية (RLO وأخواتها)، فهي لا تظهر
 * للعين وتُستعمل لقلب اتجاه النصّ أو تهريب محتوى داخل اسمٍ يبدو عادياً.
 */
const NO_CONTROL_CHARS = /^[^\p{Cc}\p{Cf}]+$/u;

const username = z
  .string()
  .trim()
  .min(2, 'اسم المستخدم قصير جداً')
  .max(40, 'اسم المستخدم طويل جداً')
  .regex(NO_CONTROL_CHARS, 'الاسم يحتوي محارف غير مسموحة');

/** رمز التحقق: ستة أرقام، بلا فراغات داخلية. */
const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام');

/**
 * الجنس — تعدادٌ مغلق لا نصّ حر.
 *
 * قيمةٌ حرة كانت ستصل القاعدة فيرفضها القيد بخطأ ٥٠٠ مبهم، أو تمرّ صيغةٌ
 * ثالثة لا تعرف طبقةُ العرض كيف تصرّف الخطاب معها.
 */
const gender = z.enum(GENDERS, {
  // «ذكراً» بالنصب: مفعولٌ به لفعل الأمر. وهي صيغة بقية رسائل هذا الملف
  // نفسه («اختر محافظة صالحة»، «اختر زبوناً واحداً على الأقل»).
  message: 'اختر ذكراً أو أنثى',
});

/**
 * [CRITICAL] الجنس **مطلوب** عند التسجيل الجديد وحده.
 *
 * الحسابات القائمة تبقى بلا قيمة (`NULL`) ولا يُطالب أصحابها بشيء لفتح
 * التطبيق؛ فرضُه هنا يضمن ألا ينمو عدد المجهولين مع كل تسجيل جديد.
 */
export const registerSchema = z.object({
  username,
  phone,
  password: newPassword,
  gender,
});

export const verifySchema = z.object({ phone, code: otpCode });

export const loginSchema = z.object({ phone, password: loginPassword });

export const forgotPasswordSchema = z.object({ phone });

export const resetPasswordSchema = z.object({
  phone,
  code: otpCode,
  newPassword,
});

export const updateProfileSchema = z.object({
  username: username.optional(),
  /**
   * مرجع الصورة كما يعيده مسار الرفع — نسبي (`/uploads/...`) وفق تمثيل
   * الوسائط الموحّد.
   *
   * الأصول الخارجية مرفوضة هنا عمداً: كان الشرط يقبل أي `https://…`، فيصلح
   * الحقل لتخزين رابط يملكه المستخدم ويُحمَّل عند كل عرض لصورته. الشكل وحده
   * لا يكفي أيضاً — الخدمة تتأكد أن المرجع ملفٌ في `media_files`.
   */
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v.startsWith('/uploads/'), 'رابط صورة غير صالح — ارفع الصورة أولاً')
    .nullable()
    .optional(),
  /**
   * تعديل الجنس من الإعدادات. اختياري في الطلب (الغائب = لا تغيير)، ولا يقبل
   * `null`: لا مسار يعيد حساباً اختار صاحبُه إلى «مجهول».
   */
  gender: gender.optional(),
});

/** تغيير كلمة المرور من الإعدادات — مستخدم مسجّل دخوله بالفعل، بلا رمز تحقق. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'أدخل كلمة المرور الحالية').max(200),
  newPassword,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
