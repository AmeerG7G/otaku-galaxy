import path from 'node:path';
import dotenv from 'dotenv';

/**
 * قراءة إعدادات البيئة — مع تمييز صريح بين التطوير والاختبار والإنتاج.
 *
 * القاعدة الحاكمة هنا: **لا قيمة افتراضية صالحة للبيئات الحقيقية**. كل سرّ
 * (مفتاح التوقيع، وصلة القاعدة) كان له بديلٌ صامت يعمل بلا اعتراض، وهو أسوأ
 * من التعطّل: خادمٌ يعمل بمفتاح معروف يبدو سليماً وهو مكشوف. الآن الإنتاج
 * **والاختبار المسبق (staging)** يسقطان عند الإقلاع إن نقص سرّ، والتطوير
 * وحده يحتفظ ببدائل واضحة.
 */

/** البيئات المعتمدة — نفس أسماء فروع Git ونكهات أندرويد. */
export type AppEnv = 'dev' | 'staging' | 'prod';

/**
 * تحديد البيئة — **يفشل مغلقاً**.
 *
 * [CRITICAL] كان أي مدخل غير معروف (أو غيابه كلياً) يسقط إلى `dev` بصمت.
 * وكل حارس في هذا الملف مربوط بـ`appEnv`: مفتاح التوقيع الافتراضي، ومزوّد
 * الرسائل `console`، ورمز التحقق الثابت — كلها تُمنع في `staging`/`prod`
 * وتُسمح في `dev`. فنشرةٌ نسيت ضبط المتغيّر كانت تُعتبر تطويراً: تُقلع
 * بمفتاح توقيع منشور في المستودع، وتطبع رموز التحقق في السجلّ، ولا يعترض
 * شيء لأن كل الحرّاس رأوا بيئة تطوير. مطبعةٌ في اسم البيئة (`prodution`)
 * كانت تفعل الشيء نفسه.
 *
 * الآن: القيمة غير المعروفة تُرمى، و`NODE_ENV=production` بلا `APP_ENV`
 * يُرمى أيضاً لأن الخادم لا يملك ما يميّز به الإنتاج من الاختبار المسبق —
 * والتخمين بينهما ليس من حقّه. `dev` تبقى الافتراضَ **فقط** حين لا يكون
 * `NODE_ENV=production`، فتبقى تجربة المطوّر كما هي بلا إعداد.
 */
function resolveAppEnv(rawEnv: string | undefined, node: string): AppEnv {
  const raw = rawEnv?.trim().toLowerCase();

  if (raw) {
    switch (raw) {
      case 'prod':
      case 'production':
        return 'prod';
      case 'staging':
      case 'stage':
        return 'staging';
      case 'dev':
      case 'development':
        return 'dev';
      default:
        throw new Error(
          `APP_ENV=${rawEnv} غير معروف. القيم المقبولة: dev, staging, prod.`,
        );
    }
  }

  if (node === 'production') {
    throw new Error(
      'APP_ENV مطلوب صراحةً حين NODE_ENV=production. ' +
        'اضبطه على staging أو prod — لا يجوز الافتراض، ' +
        'فبيئة التطوير تعني مفتاح توقيع معروفاً ورموز تحقق في السجلّ.',
    );
  }

  return 'dev';
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * بيئة الاختبار الآلي: NODE_ENV=test أو تشغيل تحت vitest.
 * تُقرأ قبل أي تحقّق كي لا يسقط تشغيل الاختبارات على متطلبات الإنتاج.
 */
export const isTest = nodeEnv === 'test' || import.meta.url.includes('vitest');

/**
 * البيئة المعتمدة — انظر `resolveAppEnv`: صريحة أو تفشل.
 *
 * `APP_ENV` هو المصدر الوحيد للاسم، بينما `NODE_ENV` تبقى لما تتوقّعه
 * المكتبات (`production` مقابل غيرها) ولا تُشتقّ منها البيئة ضمناً.
 */
export const appEnv: AppEnv = resolveAppEnv(process.env.APP_ENV, nodeEnv);

/**
 * تحميل ملف البيئة الخاص قبل `.env` العام.
 *
 * dotenv لا يدهس متغيّراً مضبوطاً سلفاً، فترتيبُ التحميل هو الأولوية:
 * متغيّرات العملية (أعلى) ← `.env.<البيئة>` ← `.env`. هكذا يبقى ملف `.env`
 * القديم صالحاً للتطوير المحلي بلا تغيير، ويأخذ كل نشرٍ ملفَّه.
 */
const explicitEnvFile = process.env.DOTENV_CONFIG_PATH?.trim();

if (explicitEnvFile) {
  // مسار صريح يعني «هذا الملف وحده».
  //
  // [CRITICAL] تحترمه الاختبارات لعزل نفسها: توجّهه إلى ملف فارغ كي تفحص
  // «السرّ مفقود» فعلاً. تحميلُ `.env` بعده كان يُعيد سرّ المطوّر فتمرّ
  // اختبارات الإقلاع الحرجة وهي لا تفحص شيئاً.
  dotenv.config({ path: explicitEnvFile, quiet: true });
} else {
  // الأولوية: متغيّرات العملية ← `.env.<البيئة>` ← `.env`.
  // dotenv لا يدهس متغيّراً مضبوطاً سلفاً، فالترتيب هو الأولوية.
  dotenv.config({ path: path.resolve(process.cwd(), `.env.${appEnv}`), quiet: true });
  dotenv.config({ quiet: true });
}

/**
 * البيئات التي تخدم مستخدمين حقيقيين.
 *
 * [CRITICAL] الاختبار المسبق (staging) يُعامَل كالإنتاج في كل ما يخصّ
 * الأسرار. كان `staging` يقع في فرع «غير الإنتاج» فيرث بدائل التطوير: مفتاح
 * توقيع معروف، ورمز تحقق ثابت `123456`. خادمٌ يشبه الإنتاج بأمان التطوير
 * هو أسوأ الاحتمالات — يحمل بيانات شبه حقيقية بحماية لا شيء.
 */
const isProduction = appEnv === 'prod';
const isStaging = appEnv === 'staging';
const requiresRealSecrets = (isProduction || isStaging) && !isTest;

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
    if (requiresRealSecrets) {
      fatalConfigErrors.push(`${name} مفقود — مطلوب في ${appEnv} بلا بديل.`);
      return '';
    }
    return devFallback;
  }
  const problem = extraCheck?.(provided);
  if (problem && requiresRealSecrets) {
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
const devOtpEnabled = devOtpRequested && !requiresRealSecrets;

if (devOtpRequested && requiresRealSecrets) {
  fatalConfigErrors.push(
    `DEV_OTP_ENABLED=true في ${appEnv} — رمز تحقق ثابت خارج التطوير غير مقبول.`,
  );
}

/**
 * إعدادات النشر التي بديلها **خاطئ** لا مجرّد ناقص.
 *
 * تختلف عن `CORS_ORIGINS`: بديلها (قائمة فارغة) يمنع كل أصل، وهو الفشل في
 * الاتجاه الآمن فلا يُطلب صراحةً. أما هذان فبديلهما يعمل ويعطي سلوكاً
 * خاطئاً بصمت، ولذلك يجب أن يُذكرا.
 */
const trustProxySetting = requireInProduction(
  'TRUST_PROXY',
  process.env.TRUST_PROXY,
  'false',
);

const publicBaseUrl = requireInProduction(
  'PUBLIC_BASE_URL',
  process.env.PUBLIC_BASE_URL,
  `http://localhost:${Number(process.env.PORT ?? 4000)}`,
  (v) => (/^https?:\/\/.+/.test(v) ? null : 'يجب أن يبدأ بـ http:// أو https://'),
);

if (fatalConfigErrors.length > 0) {
  throw new Error(
    `فشل التحقق من إعدادات الإنتاج:\n  - ${fatalConfigErrors.join('\n  - ')}\n` +
      'صحّح متغيّرات البيئة ثم أعد التشغيل.',
  );
}

export const config = {
  nodeEnv,
  /** `dev` / `staging` / `prod` — الاسم المعتمد عبر المنظومة كلها. */
  appEnv,
  isDev: appEnv === 'dev',
  isStaging,
  isProduction,

  port: Number(process.env.PORT ?? 4000),

  /**
   * عدد الوسطاء الموثوقين أمام الخادم.
   *
   * بدونه يرى express عنوان الوسيط لكل الطلبات، فيصير حدّ المعدّل دلواً
   * واحداً للعالم كله — وهو ما يُسقط التسجيل ودخول المستخدمين جميعاً.
   *
   * [CRITICAL] كان `staging` يرث `'false'` لأن الافتراض كان مربوطاً
   * بالإنتاج وحده. خادم اختبارٍ خلف nginx بهذه القيمة يجعل كل الطلبات تبدو
   * قادمة من عنوان الوسيط، فيقفل التسجيل والدخول على الجميع بعد أول عشرة
   * طلبات — عطلٌ يبدو «مشكلة في الرمز» وهو إعداد. صار مطلوباً صراحةً في
   * البيئتين الحقيقيتين (انظر التحقق أعلاه).
   */
  trustProxy: trustProxySetting,

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
    provider: (process.env.SMS_PROVIDER ?? (requiresRealSecrets ? 'http' : 'console')).toLowerCase(),
    apiKey: process.env.SMS_API_KEY ?? '',
    apiSecret: process.env.SMS_API_SECRET ?? '',
    sender: process.env.SMS_SENDER ?? '',
    /** نقطة النهاية لدى المزوّد (مطلوبة لمزوّد http). */
    baseUrl: process.env.SMS_BASE_URL ?? '',
    timeoutMs: Number(process.env.SMS_TIMEOUT_MS ?? 10_000),
  },

  /**
   * مزوّد الإشعارات الفورية — نفس نمط `sms` أعلاه ونفس ضماناته.
   *
   * `console`/`noop` مرفوضان في staging/prod: إشعارٌ «يُرسل» بنجاح ظاهري
   * ولا يصل هاتفاً هو عطلٌ صامت لا يكتشفه إلا الزبون الذي لم يصله شيء.
   */
  push: {
    provider: (process.env.PUSH_PROVIDER ?? (requiresRealSecrets ? 'fcm' : 'console')).toLowerCase(),
    projectId: process.env.FCM_PROJECT_ID ?? '',
    clientEmail: process.env.FCM_CLIENT_EMAIL ?? '',
    // مفتاح حساب الخدمة — يُمرَّر بأسطر `\n` مهرّبة في متغيّر البيئة.
    privateKey: (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    timeoutMs: Number(process.env.PUSH_TIMEOUT_MS ?? 10_000),
  },

  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * أصل الخادم العام — تُبنى منه روابط الصور المطلقة التي يقرأها التطبيق.
   *
   * [CRITICAL] البديل `http://localhost` صامتٌ وخاطئ خارج جهاز المطوّر:
   * الهاتف الذي يقرأ رابطاً يبدأ بـ`localhost` يطلبه من نفسه، فتظهر كل
   * الصور مكسورة بلا رسالة خطأ واحدة في الخادم. مطلوب صراحةً في
   * `staging`/`prod`.
   */
  publicBaseUrl: publicBaseUrl.replace(/\/$/, ''),

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
     * المهلة بين خروج الطلب للتوصيل وإرسال تذكير التقييم (ساعات).
     *
     * [CRITICAL] هذه **لا تفتح التقييم ولا تؤخّره**. التقييم يُفتح بتأكيد
     * الاستلام فوراً؛ ما تجدوله هذه القيمة هو إشعار «شلونها المنتجات؟»
     * لمن استلم ولم يقيّم بعد.
     *
     * كانت تُسمّى `ratingDelayHours` ويطغى عليها إعداد لوحة التحكم
     * `order_rating_delay_hours`. أُزيل ذلك الإعداد (هجرة ٠٤٣) لأن مهلةً
     * تفصل بين ضغطة «استلمت طلبي» وفتح التقييم تسأل الزبونَ عن رأيه بعد أن
     * ينساه. ما بقي متغيّرُ بيئة تشغيلي للإشعار، لا إعداداً تجارياً في
     * المتصفح.
     */
    reviewReminderDelayHours: Number(
      process.env.ORDER_REVIEW_REMINDER_DELAY_HOURS ?? 16,
    ),
    /** كل كم مللي ثانية تفحص الجدولةُ التذكيراتِ المستحقة. */
    ratingReminderIntervalMs: Number(
      process.env.RATING_REMINDER_INTERVAL_MS ?? 5 * 60 * 1000,
    ),
    /** سقف التذكيرات في الدورة الواحدة — يمنع دفعة ضخمة بعد توقف طويل. */
    ratingReminderBatchSize: Number(process.env.RATING_REMINDER_BATCH ?? 200),
  },

  /**
   * المنطقة الزمنية التي يعيش فيها المتجر.
   *
   * [CRITICAL] «عيد ميلاد اليوم» سؤالٌ عن تقويم الزبون لا عن ساعة الخادم.
   * خادمٌ يعمل بـUTC يرى يوماً جديداً الساعة الثالثة فجراً ببغداد، فتُرسل
   * تهنئةُ الغد قبل أن ينتهي اليوم عند صاحبها بثلاث ساعات — ويوم الميلاد
   * الحقيقي يمرّ وقد صُنّف «أمس». لذلك يُحسب «اليوم» بهذه المنطقة صراحةً
   * في كل استعلام تاريخ ميلاد، لا بـ`CURRENT_DATE` الخام.
   */
  storeTimezone: process.env.STORE_TIMEZONE ?? 'Asia/Baghdad',

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
