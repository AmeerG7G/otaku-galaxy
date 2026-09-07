import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { config, isTest } from '../config/index.js';
import { AppError, Errors } from '../utils/errors.js';
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
  if (isBodyParserSyntaxError(error)) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'جسم الطلب غير صالح JSON',
      error: { code: 'INVALID_JSON' },
    });
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

  httpError(res, error);
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    data: null,
    message: 'المسار غير موجود',
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
  const phone = typeof body?.phone === 'string' ? body.phone : 'unknown';
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
    handler: (_req, res) => {
      httpError(
        res,
        Errors.tooManyRequests(
          options.message ?? 'طلبات كثيرة، حاول لاحقاً',
          options.code ?? 'RATE_LIMITED',
        ),
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

/** محاولات التحقق من الرمز لكل (رقم + عنوان) — فوق سقف المحاولات المخزَّن مع الرمز نفسه. */
export function otpVerifyRateLimiter() {
  return limiter({
    limit: config.rateLimit.otpVerifyMaxPerPhone,
    keyGenerator: phoneAndIpKey,
    message: 'محاولات تحقق كثيرة — اطلب رمزاً جديداً بعد قليل',
    code: 'OTP_VERIFY_RATE_LIMITED',
  });
}

/**
 * طلبات إرسال رمز لكل عنوان.
 * الحدّ الأهم (لكل رقم) يُطبَّق في `otpService` من القاعدة، لأنه يجب أن
 * يصمد عبر إعادة التشغيل وعبر أكثر من نسخة خادم.
 */
export function otpSendRateLimiter() {
  return limiter({
    limit: config.rateLimit.otpSendMaxPerIp,
    message: 'طلبات رموز كثيرة — حاول بعد قليل',
    code: 'OTP_SEND_RATE_LIMITED',
  });
}

export function globalRateLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.globalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      httpError(res, Errors.tooManyRequests());
    },
  });
}