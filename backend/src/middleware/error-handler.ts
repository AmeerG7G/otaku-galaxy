import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { MulterError } from 'multer';
import { config, isTest } from '../config/index.js';
import { localizeErrorMessage } from '../domain/errorMessages.js';
import { AppError, Errors } from '../utils/errors.js';
import { resolveLocale } from '../utils/locale.js';
import { normalizeIraqiPhone } from '../utils/phone.js';
import { httpError } from '../utils/response.js';

/**
 * هل هذا خطأ تحليل JSON قادم من `express.json()`؟
 *
 * محلّل الجسم يرمي `SyntaxError` ويعلّق عليه الجسمَ الخام. الفحص بـ
 * `instanceof SyntaxError` وحده يبتلع أيضاً أي `SyntaxError` يقع في منطق
 * التطبيق نفسه (تحليل قيمة فاسدة قادمة من القاعدة مثلاً) ويبلّغ عنه
 * بـ«جسم الطلب غير صالح JSON» — رسالة تُرسل مطوِّراً في الاتجاه الخطأ
 * تماماً وهو يطارد عطلاً لا علاقة له بالطلب.
 */
function isBodyParserSyntaxError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    'body' in error &&
    (error as { status?: number }).status === 400
  );
}

/**
 * خطأ من `multer` — حدُّ الحجم أو عددُ الملفات، لا عطلُ خادم.
 *
 * [CRITICAL] كان يسقط في فرع «غير متوقَّع» فيردّ **500**. الحدّ كان يعمل
 * (الملف يُرفض) لكن العميل يقرأ «خطأ في الخادم» ولا يعرف أن ملفه كبير، وكلُّ
 * رفعٍ كبير يلوّث سجلّ الأعطال بخطأ ليس عطلاً. الترجمة هنا تُبقي الحدّ كما
 * هو وتقول سببه.
 */
function multerErrorToAppError(error: MulterError): AppError {
  if (error.code === 'LIMIT_FILE_SIZE') {
    const mb = Math.round(config.uploads.maxBytes / (1024 * 1024));
    return Errors.badRequest(
      `حجم الصورة أكبر من الحدّ المسموح (${mb} ميغابايت)`,
      'FILE_TOO_LARGE',
    );
  }
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
    return Errors.badRequest('يُرفع ملف واحد فقط', 'TOO_MANY_FILES');
  }
  return Errors.badRequest('تعذّر رفع الملف', 'UPLOAD_FAILED');
}

/**
 * أخطاء PostgreSQL التي هي في حقيقتها **رفضٌ للمدخلات** لا عطلُ خادم.
 *
 * [CRITICAL] كانت تسقط كلها في فرع «غير متوقَّع» فتخرج ٥٠٠ وتُسجَّل عطلاً:
 * اسمُ قسمٍ مكرّر (`23505`)، إشعارٌ لمستخدمٍ لا وجود له (`23503`)، معرّفٌ
 * ليس UUID وصل استعلاماً بلا تحقّق (`22P02`)، رسومٌ تفيض عن العمود
 * (`22003`). المسؤول كان يقرأ «حدث خطأ غير متوقع» عن اسمٍ كتبه مرّتين،
 * والسجلّ يمتلئ بأعطالٍ ليست أعطالاً.
 *
 * الترجمة هنا **شبكةُ أمان** لا بديلاً عن التحقّق عند الحدّ: المدقّقات
 * والخدمات تبقى المصدر الأول للرسائل الدقيقة، وما أفلت منها يصل هنا
 * برمزٍ ثابت ورسالةٍ عامّة بدل ٥٠٠. أصناف SQLSTATE المترجَمة هي أصناف
 * السلامة والتحويل وحدها (`23xxx`، `22xxx`)؛ الجمود والانقطاع والصياغة
 * (`40xxx`، `08xxx`، `42xxx`…) تبقى ٥٠٠ لأنها أعطالٌ فعلاً.
 *
 * `23503` يحمل معنيين يفرّقهما `detail` الذي يرسله PostgreSQL نفسه:
 * «ليس موجوداً» (إدراجٌ يشير إلى صفٍّ غائب → ٤٠٤) و«ما زال مُشاراً إليه»
 * (حذفٌ يمنعه اعتماد → ٤٠٩). لا تفاصيل القاعدة تخرج في الحالتين.
 */
export function pgErrorToAppError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, detail } = error as { code?: unknown; detail?: unknown };
  if (typeof code !== 'string') return null;
  switch (code) {
    case '23505':
      return Errors.conflict('هذه القيمة مستخدمة مسبقاً', 'DUPLICATE_VALUE');
    case '23503':
      return typeof detail === 'string' && detail.includes('is not present')
        ? Errors.notFound('العنصر المرتبط غير موجود', 'RELATED_NOT_FOUND')
        : Errors.conflict('لا يمكن إتمام العملية — توجد بيانات مرتبطة', 'HAS_DEPENDENTS');
    case '23514':
      return Errors.badRequest('قيمة غير صالحة', 'INVALID_VALUE');
    case '22P02':
      return Errors.badRequest('معرّف أو قيمة غير صالحة', 'INVALID_VALUE');
    case '22003':
      return Errors.badRequest('قيمة خارج المدى المسموح', 'VALUE_OUT_OF_RANGE');
    case '22001':
      return Errors.badRequest('النصّ أطول من المسموح', 'VALUE_TOO_LONG');
    default:
      return null;
  }
}

/**
 * حاجز أخطاء عالمي — كل الأخطاء تمر من هنا بلا تسريب التفاصيل الداخلية.
 *
 * [CRITICAL] الخطأ غير المتوقَّع يُسجَّل هنا قبل أن يُبتلع.
 *
 * كان `httpError` يردّ 500 عامّاً ويُسقط الخطأ الأصلي بلا أثر: لا رسالة،
 * ولا كومة استدعاء، ولا مسار الطلب الذي فجّره. أي أن عطلاً في الإنتاج كان
 * يصل العميلَ كـ«حدث خطأ غير متوقع» ويختفي من الخادم تماماً — لا شيء
 * يمكن تشخيصه لاحقاً. إخفاء التفاصيل عن **العميل** صحيح؛ إخفاؤها عن
 * **المشغّل** ليس أماناً بل عمى.
 *
 * `AppError` لا يُسجَّل: هو مسار أعمال متوقَّع (٤٠٤، ٤٠٩، تحقق) لا عطل.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  // [CRITICAL] لغة الطالب تُحسم هنا مرّةً لكل خطأ — الخدمات ترمي بالعربية
  // ولا تعرف `req`. انظر `domain/errorMessages.ts`.
  const locale = resolveLocale(req);

  if (isBodyParserSyntaxError(error)) {
    res.status(400).json({
      success: false,
      data: null,
      message: localizeErrorMessage('جسم الطلب غير صالح JSON', locale),
      error: { code: 'INVALID_JSON' },
    });
    return;
  }

  if (error instanceof MulterError) {
    httpError(res, multerErrorToAppError(error), locale);
    return;
  }

  const translated = pgErrorToAppError(error);
  if (translated) {
    // ليس عطلاً فلا كومة استدعاء، لكن رفضٌ وصل القاعدة ولم يوقفه مدقّق
    // يستحق سطراً يدلّ على الحدّ الناقص. المسار والرمز فقط — لا جسم.
    console.warn(
      `[db-reject] ${req.method} ${req.originalUrl} — SQLSTATE ${(error as { code: string }).code} → ${translated.code}`,
    );
    httpError(res, translated, locale);
    return;
  }

  if (!(error instanceof AppError)) {
    // المسار والطريقة فقط — لا جسم الطلب ولا الرؤوس، فلا تتسرّب كلمة مرور
    // ولا توكن إلى السجل.
    console.error(
      `[error] ${req.method} ${req.originalUrl} — خطأ غير متوقَّع:`,
      error,
    );
  }

  httpError(res, error, locale);
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    data: null,
    message: localizeErrorMessage('المسار غير موجود', resolveLocale(req)),
    error: { code: 'NOT_FOUND' },
  });
}

/**
 * مفتاح «الرقم + العنوان» لحدود المصادقة الحسّاسة.
 *
 * ربط الحدّ بالعنوان وحده هو ما كسر التسجيل والدخول: خلف NAT المشغّل — وهو
 * الحال الغالب على شبكات الهاتف — يتقاسم آلاف المشتركين عنواناً واحداً،
 * فتستهلك حفنةُ مستخدمين الدلوَ ويُمنع الباقون. وربطه بالرقم وحده يسمح
 * لمهاجم بتخمين كلمات المرور على أرقام كثيرة بلا سقف. الجمع بينهما يحفظ
 * الغرضين: مستخدم شرعي لا يزاحمه جيرانه في الشبكة، ومهاجم لا يجد رقماً
 * مفتوحاً للتخمين.
 */
function phoneAndIpKey(req: Request): string {
  const ipKey = ipKeyGenerator(req.ip ?? '');
  const body = req.body as { phone?: unknown } | undefined;
  const raw = typeof body?.phone === 'string' ? body.phone : 'unknown';
  // [CRITICAL] الدلو بالرقم **المطبَّع** لا بالنصّ كما وصل: `07701234567` و
  // `0770 123 4567` و`+9647701234567` رقمٌ واحد، وكان كلٌّ منها يملك دلواً
  // مستقلاً فيتضاعف سقف التخمين بعدد الصيغ. غير الصالح يبقى بنصّه.
  const phone = normalizeIraqiPhone(raw) ?? raw;
  return `${ipKey}:${phone}`;
}

function limiter(options: {
  limit: number;
  windowMs?: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
  code?: string;
}) {
  return rateLimit({
    windowMs: options.windowMs ?? config.rateLimit.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
    skip: () => isTest,
    handler: (req, res) => {
      httpError(
        res,
        Errors.tooManyRequests(
          options.message ?? 'طلبات كثيرة، حاول لاحقاً',
          options.code ?? 'RATE_LIMITED',
        ),
        resolveLocale(req),
      );
    },
  });
}

/**
 * سقف عام لنقاط المصادقة لكل عنوان.
 *
 * دوره حماية الخادم من الفيضان لا منع التخمين — لذلك هو واسع عمداً. المنعُ
 * الحقيقي يقع في الحدود المرتبطة بالرقم أدناه.
 */
export function authRateLimiter() {
  return limiter({ limit: config.rateLimit.authMax });
}

/** محاولات تسجيل الدخول لكل (رقم + عنوان) — الحاجز الفعلي ضد تخمين كلمة المرور. */
export function loginRateLimiter() {
  return limiter({
    limit: config.rateLimit.loginMaxPerPhone,
    keyGenerator: phoneAndIpKey,
    message: 'محاولات دخول كثيرة لهذا الرقم — حاول بعد قليل',
    code: 'LOGIN_RATE_LIMITED',
  });
}

/**
 * طلبات إنشاء الحساب وإعادة التعيين لكل (رقم + عنوان).
 *
 * هذه النقاط تنشئ صفوفاً تراها الإدارة؛ سقفٌ بالرقم يمنع إغراق اللوحة
 * بطلباتٍ لرقمٍ واحد، والعنوان يمنع الإغراق من مصدرٍ واحد على أرقام كثيرة.
 * حلّت محلّ حدود إرسال/تحقّق رمز SMS التي لم يعد لها مسار.
 */
export function accountRequestRateLimiter() {
  return limiter({
    limit: config.rateLimit.accountRequestMaxPerPhone,
    keyGenerator: phoneAndIpKey,
    message: 'طلبات كثيرة لهذا الرقم — حاول بعد قليل',
    code: 'ACCOUNT_REQUEST_RATE_LIMITED',
  });
}

/**
 * سقف الرفع — بالحساب لا بالعنوان.
 *
 * المفتاح هو المستخدم المصادَق عليه: المسار محميّ أصلاً، والمفتاح بالعنوان
 * كان سيجمع مكتباً كاملاً خلف NAT واحد في سقفٍ واحد. العنوان يبقى مفتاحاً
 * احتياطياً لو غاب التوثيق لأي سبب.
 */
export function uploadRateLimiter(options: { limit: number }) {
  return limiter({
    limit: options.limit,
    keyGenerator: (req) => req.auth?.id ?? ipKeyGenerator(req.ip ?? ''),
    message: 'رفعٌ كثير في وقت قصير — حاول بعد قليل',
    code: 'UPLOAD_RATE_LIMITED',
  });
}

export function globalRateLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    handler: (req, res) => {
      httpError(res, Errors.tooManyRequests(), resolveLocale(req));
    },
  });
}