import 'dotenv/config';

/**
 * قراءة إعدادات البيئة — مع تمييز صريح بين التطوير والإنتاج.
 *
 * القاعدة الحاكمة هنا: **لا قيمة افتراضية صالحة للإنتاج**. كل سرّ (مفتاح
 * التوقيع، وصلة القاعدة) كان له بديلٌ صامت يعمل في الإنتاج بلا اعتراض، وهو
 * أسوأ من التعطّل: خادمٌ يعمل بمفتاح معروف يبدو سليماً وهو مكشوف. الآن
 * الإنتاج يسقط عند الإقلاع إن نقص سرّ، والتطوير وحده يحتفظ ببدائل واضحة.
 */

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/**
 * بيئة الاختبار: NODE_ENV=test أو تشغيل تحت vitest.
 * تُقرأ قبل أي تحقّق كي لا يسقط تشغيل الاختبارات على متطلبات الإنتاج.
 */
export const isTest = nodeEnv === 'test' || import.meta.url.includes('vitest');

/** يُجمَع كل نقص إعداد ثم يُرمى مرة واحدة — لا اكتشاف نقص واحد في كل إقلاع. */
const fatalConfigErrors: string[] = [];

function requireInProduction(
  name: string,
  value: string | undefined,
  devFallback: string,
  extraCheck?: (v: string) => string | null,
): string {
  const provided = value?.trim();
  if (!provided) {
    if (isProduction) {
      fatalConfigErrors.push(`${name} مفقود — مطلوب في الإنتاج بلا بديل.`);
      return '';
    }
    return devFallback;
  }
  const problem = extraCheck?.(provided);
  if (problem && isProduction) {
    fatalConfigErrors.push(`${name}: ${problem}`);
  }
  return provided;
}

// ===== JWT (S-2) =====
/**
 * المفتاح الذي كان يُستعمل كبديل صامت. يبقى مذكوراً هنا لسبب واحد: رفضُه
 * صراحةً في الإنتاج حتى لو نسخه أحدهم من ملف المثال إلى متغيّرات الخادم.
 */
const KNOWN_INSECURE_SECRETS = new Set([
  'insecure_dev_secret_change_me',
  'change_me_generate_a_long_random_hex_string',
  'secret',
  'changeme',
]);

const MIN_JWT_SECRET_LENGTH = 32;

/** بديل التطوير موسومٌ باسمه — يستحيل أن يُخلَط بمفتاح إنتاج. */
const DEV_JWT_SECRET = 'development_only_jwt_secret_do_not_use_in_production';

const jwtSecret = requireInProduction(
  'JWT_SECRET',
  process.env.JWT_SECRET,
  DEV_JWT_SECRET,
  (v) => {
    if (KNOWN_INSECURE_SECRETS.has(v)) return 'قيمة معروفة/افتراضية — ولّد مفتاحاً بـ openssl rand -hex 32';
    if (v.length < MIN_JWT_SECRET_LENGTH) return `قصير جداً (${v.length} حرفاً، الحد الأدنى ${MIN_JWT_SECRET_LENGTH}).`;
    return null;
  },
);

// ===== قاعدة البيانات =====
const DEV_DATABASE_URL =
  'postgres://otaku_galaxy_app:change_me_dev_password@localhost:5432/otaku_galaxy';
const DEV_TEST_DATABASE_URL =
  'postgres://otaku_galaxy_app:change_me_dev_password@localhost:5432/otaku_galaxy_test';

function invalidPostgresUrl(v: string): string | null {
  if (!/^postgres(ql)?:\/\//.test(v)) return 'ليست وصلة postgres صالحة (يجب أن تبدأ بـ postgres://).';
  try {
    const parsed = new URL(v);
    if (!parsed.hostname) return 'بلا مضيف.';
    if (!parsed.pathname.replace(/^\//, '')) return 'بلا اسم قاعدة بيانات.';
  } catch {
    return 'تعذّر تحليلها كعنوان صالح.';
  }
  return null;
}

const databaseUrl = requireInProduction(
  'DATABASE_URL',
  process.env.DATABASE_URL,
  DEV_DATABASE_URL,
  invalidPostgresUrl,
);

// ===== رموز التحقق (OTP) =====
/**
 * الرمز الثابت 123456 لا يُفعَّل إلا بطلب صريح، ولا يُفعَّل في الإنتاج أبداً
 * مهما كان المتغيّر. السلوك السابق كان يشتغل لمجرّد غياب الإعداد — أي أن
 * نشرةً بلا NODE_ENV كانت تقبل 123456 لكل حساب.
 */
const devOtpRequested = process.env.DEV_OTP_ENABLED === 'true';
const devOtpEnabled = devOtpRequested && !isProduction;

if (devOtpRequested && isProduction) {
  fatalConfigErrors.push('DEV_OTP_ENABLED=true في الإنتاج — رمز ثابت في الإنتاج غير مقبول.');
}

if (fatalConfigErrors.length > 0) {
  throw new Error(
    `فشل التحقق من إعدادات الإنتاج:\n  - ${fatalConfigErrors.join('\n  - ')}\n` +
      'صحّح متغيّرات البيئة ثم أعد التشغيل.',
  );
}

export const config = {
  nodeEnv,
  isDev: nodeEnv === 'development',
  isProduction,

  port: Number(process.env.PORT ?? 4000),

  /**
   * عدد الوسطاء الموثوقين أمام الخادم.
   *
   * بدونه يرى express عنوان الوسيط لكل الطلبات، فيصير حدّ المعدّل دلواً
   * واحداً للعالم كله — وهو ما يُسقط التسجيل ودخول المستخدمين جميعاً.
   */
  trustProxy: process.env.TRUST_PROXY ?? (isProduction ? '1' : 'false'),

  databaseUrl,
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? DEV_TEST_DATABASE_URL,
  migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? '',

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),

  verification: {
    /** رمز التطوير الثابت — مفعَّل فقط بطلب صريح وخارج الإنتاج. */
    devOtpEnabled,
    devOtpCode: process.env.DEV_OTP_CODE ?? process.env.DEVELOPMENT_OTP_CODE ?? '123456',
    lifetimeMinutes: Number(process.env.VERIFICATION_CODE_LIFETIME_MINUTES ?? 10),
    maxAttempts: Number(process.env.VERIFICATION_MAX_ATTEMPTS ?? 5),
    /** أقصى عدد إرسالات لنفس الرقم داخل نافذة إعادة الإرسال. */
    maxSendsPerWindow: Number(process.env.VERIFICATION_MAX_SENDS_PER_WINDOW ?? 5),
    resendWindowMinutes: Number(process.env.VERIFICATION_RESEND_WINDOW_MINUTES ?? 15),
    /** أقل فاصل زمني بين إرسالين لنفس الرقم (ثوانٍ). */
    resendCooldownSeconds: Number(process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS ?? 60),
  },

  /**
   * مزوّد الرسائل — حدّ التماس مع الخارج.
   *
   * `console`: يطبع الرمز محلياً (تطوير فقط).
   * `http`:    مزوّد HTTP عام يُضبَط بالكامل من البيئة.
   * `noop`:    لا يرسل شيئاً (اختبارات).
   * لا اسم مزوّد مخبوز في الكود — تبديله إعدادٌ لا إعادة كتابة.
   */
  sms: {
    provider: (process.env.SMS_PROVIDER ?? (isProduction ? 'http' : 'console')).toLowerCase(),
    apiKey: process.env.SMS_API_KEY ?? '',
    apiSecret: process.env.SMS_API_SECRET ?? '',
    sender: process.env.SMS_SENDER ?? '',
    /** نقطة النهاية لدى المزوّد (مطلوبة لمزوّد http). */
    baseUrl: process.env.SMS_BASE_URL ?? '',
    timeoutMs: Number(process.env.SMS_TIMEOUT_MS ?? 10_000),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** أصل الخادم العام — تُبنى منه روابط الصور المطلقة التي يقرأها التطبيق. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`).replace(/\/$/, ''),

  uploads: {
    /** مجلد التخزين على القرص (نسبي لجذر تشغيل الخادم). */
    directory: process.env.UPLOADS_DIR ?? 'uploads',
    /** البادئة العامة التي تُبنى منها روابط الصور المحفوظة. */
    publicPath: process.env.UPLOADS_PUBLIC_PATH ?? '/uploads',
    /** أقصى حجم للصورة الواحدة. */
    maxBytes: Number(process.env.UPLOADS_MAX_BYTES ?? 5 * 1024 * 1024),
  },

  orders: {
    /**
     * المهلة بين استلام الطلب وفتح التقييم (ساعات).
     * قابلة للضبط بيئياً حتى تختبرها المنظومة بلا انتظار يوم كامل.
     */
    ratingDelayHours: Number(process.env.ORDER_RATING_DELAY_HOURS ?? 24),
    /** كل كم مللي ثانية تفحص الجدولةُ التذكيراتِ المستحقة. */
    ratingReminderIntervalMs: Number(
      process.env.RATING_REMINDER_INTERVAL_MS ?? 5 * 60 * 1000,
    ),
    /** سقف التذكيرات في الدورة الواحدة — يمنع دفعة ضخمة بعد توقف طويل. */
    ratingReminderBatchSize: Number(process.env.RATING_REMINDER_BATCH ?? 200),
  },

  /**
   * حدود المعدّل.
   *
   * كانت نقاط المصادقة الستّ تتقاسم دلواً واحداً (10 طلبات/15 دقيقة لكل IP)،
   * فرحلة تسجيل واحدة (تسجيل + تحقق + إعادة إرسال) تلتهم نصفه، وخلف NAT
   * المشغّل يتقاسم آلاف المشتركين نفس الدلو. النتيجة: 429 على التسجيل
   * *والدخول* معاً — وهي بالضبط شكوى «لا أستطيع إنشاء حساب جديد».
   * الآن لكل غرض دلوه، والأقفال الحسّاسة تُفتَح بالرقم لا بالـIP وحده.
   */
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    globalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX ?? 300),
    /** سقف عام لنقاط المصادقة لكل IP — واسع لأنه يحمي من الفيضان لا من التخمين. */
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 60),
    /** محاولات تسجيل الدخول لكل (رقم + IP) — هذا هو الحاجز ضد تخمين كلمة المرور. */
    loginMaxPerPhone: Number(process.env.RATE_LIMIT_LOGIN_MAX_PER_PHONE ?? 10),
    /** محاولات التحقق من الرمز لكل (رقم + IP). */
    otpVerifyMaxPerPhone: Number(process.env.RATE_LIMIT_OTP_VERIFY_MAX ?? 10),
    /** طلبات إرسال رمز لكل IP (الحدّ بالرقم يُطبَّق في otpService). */
    otpSendMaxPerIp: Number(process.env.RATE_LIMIT_OTP_SEND_MAX ?? 20),
  },
} as const;
