import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** عنوان الزبون الفعلي — انظر [resolveClientIp]. اقرأه عبر [clientIp]. */
    clientIp?: string;
  }
}

export const CLIENT_IP_HEADER = 'X-OG-Client-IP';
export const CLIENT_IP_SIGNATURE_HEADER = 'X-OG-Client-Signature';

/** نافذة التوقيع بالثواني — الموقع والخادم على المضيف نفسه أو خلف NTP. */
const MAX_SKEW_SECONDS = 60;

function mac(secret: string, ip: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`og-client-ip:v1\n${timestamp}\n${ip}`).digest('hex');
}

/**
 * توقيع عنوان الزبون كما يرسله خادم الموقع — `web-store/src/lib/api.ts` يطابقه.
 * القيمة `<ثوانٍ>.<hex>`.
 */
export function signClientIp(secret: string, ip: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    [CLIENT_IP_HEADER]: ip,
    [CLIENT_IP_SIGNATURE_HEADER]: `${nowSeconds}.${mac(secret, ip, nowSeconds)}`,
  };
}

let lastWarnedAt = 0;
function warnRejected(reason: string) {
  // تحذيرٌ واحد كل عشر دقائق: توقيعٌ يُرفض باستمرار سوءُ إعداد يستحق أن
  // يُرى (زبائن الموقع عادوا دلواً واحداً)، لا أن يملأ السجلّ.
  const now = Date.now();
  if (now - lastWarnedAt < 10 * 60_000) return;
  lastWarnedAt = now;
  console.warn(`[client-ip] ترويسة عنوان الزبون مرفوضة (${reason}) — العنوان من req.ip`);
}

const proxyWarned = { forwardedUntrusted: false, unknownIp: false };
/**
 * فحوص express-rate-limit التشخيصية (X-Forwarded-For مع `TRUST_PROXY=false`،
 * `req.ip` مجهول) لا تعمل إلا داخل مولّد مفاتيحه الافتراضي، وكل حدودنا
 * تستعمل `clientRateLimitKey`. نعيدها هنا: إعداد وسيطٍ خاطئ يجمع كل الزبائن في
 * دلوٍ واحد بلا أي خطأ ظاهر. تحذيرٌ واحد لكل مشكلة في عمر العملية — لكلٍّ علمُه،
 * فلا يُسكت أحدهما الآخر. (الثقة المطلقة `true` لا يبلغها إعدادنا:
 * `TRUST_PROXY=true` يُسقط الإقلاع أصلاً.)
 */
function checkProxySetup(req: Request) {
  if (!proxyWarned.forwardedUntrusted && !req.app.get('trust proxy') && req.get('x-forwarded-for') !== undefined) {
    proxyWarned.forwardedUntrusted = true;
    console.warn('[client-ip] إعداد الوسيط: X-Forwarded-For موجودة و TRUST_PROXY=false — كل الطلبات بعنوان الوسيط');
  }
  // اتصالٌ قطعه صاحبه قبل المعالجة يترك `req.ip` مجهولاً هو أيضاً: طلبٌ واحد
  // أُلغي، لا إعدادٌ خاطئ.
  if (!proxyWarned.unknownIp && req.ip === undefined && !req.socket.destroyed) {
    proxyWarned.unknownIp = true;
    console.warn('[client-ip] إعداد الوسيط: req.ip غير معروف — كل الطلبات في مفتاحٍ فارغ');
  }
}

/**
 * [CRITICAL] عنوان الزبون لحدود المعدّل.
 *
 * الموقع (`web-store/`) يستدعي الخادم من خادمه، فـ`req.ip` عنده هو عنوان خادم
 * الموقع لكل الزبائن: دلوٌ عام واحد (٣٠٠ طلب/١٥ دقيقة) لكل زوّار الموقع،
 * وحدُّ الدخول بالرقم يفقد نصفه الآخر. الموقع يرسل عنوان الزبون موقَّعاً
 * بـ`BFF_SHARED_SECRET`؛ يُقبل العنوان **فقط** بتوقيعٍ صحيح حديث، وإلا بقي
 * `req.ip` كما كان — فالترويسة من الإنترنت (عبر nginx أو مباشرة) لا تزوّر شيئاً.
 *
 * بلا سرّ مُعدّ لا يُقبل العنوان أبداً، ويُحذَّر إن وصلت ترويسة موقَّعة.
 */
export function resolveClientIp(
  secret: string | null = config.bffSharedSecret,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    checkProxySetup(req);
    req.clientIp = req.ip ?? '';
    const claimed = req.get(CLIENT_IP_HEADER);
    const signature = req.get(CLIENT_IP_SIGNATURE_HEADER);
    if (claimed === undefined || signature === undefined) return next();
    if (!secret) {
      // ترويسةٌ موقَّعة والخادم بلا سرّ: إمّا موقعٌ يوقّع وخادمٌ نسي السرّ (نصف
      // إعداد: زبائن الموقع دلوٌ واحد)، وإمّا عميلٌ من الإنترنت يرسلها عبثاً قبل
      // نشر الموقع. الترويسة تُهمَل في الحالتين؛ الرسالة تقول ذلك ولا تجزم.
      warnRejected('ترويسة موقَّعة بلا BFF_SHARED_SECRET على الخادم — موقعٌ بلا سرّ هنا، أو عميلٌ يرسلها');
      return next();
    }

    const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(signature);
    if (!match || isIP(claimed) === 0) {
      warnRejected('صيغة');
      return next();
    }
    const timestamp = Number(match[1]);
    if (Math.abs(nowSeconds() - timestamp) > MAX_SKEW_SECONDS) {
      warnRejected('منتهي');
      return next();
    }
    const expected = Buffer.from(mac(secret, claimed, timestamp), 'hex');
    const given = Buffer.from(match[2]!, 'hex');
    if (!timingSafeEqual(expected, given)) {
      warnRejected('توقيع');
      return next();
    }
    req.clientIp = claimed;
    return next();
  };
}

/** العنوان الذي تُبنى عليه حدود المعدّل — بعد [resolveClientIp]، و`req.ip` قبله. */
export function clientIp(req: Request): string {
  return req.clientIp ?? req.ip ?? '';
}
