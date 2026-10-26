import { config } from '../../config/index.js';

/**
 * حدّ التماس مع مزوّد الرسائل.
 *
 * نظام المصادقة لا يعرف أي مزوّد بعينه — يعرف هذه الواجهة فقط. تبديل
 * المزوّد (أو إضافة ثانٍ احتياطي) يقع كله خلف هذا الملف بلا لمس
 * `otpService` ولا المتحكّمات ولا القاعدة.
 */
export interface SmsProvider {
  /** اسم المزوّد للسجلّات والتشخيص — لا يُستعمل في أي منطق. */
  readonly name: string;
  /**
   * إرسال رسالة نصية. يرمي عند الفشل: الاستدعاء الأعلى يقرّر هل يُبلغ
   * المستخدم أم يبتلع الخطأ (كي لا يكشف وجود الرقم من عدمه).
   */
  send(input: { to: string; message: string }): Promise<void>;
}

export class SmsDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SmsDeliveryError';
  }
}

/**
 * مزوّد التطوير: يطبع الرسالة في الطرفية بدل إرسالها.
 *
 * لا يُنشأ إطلاقاً في الإنتاج — البانية أدناه ترفض ذلك — فلا يوجد مسارٌ
 * يطبع فيه رمزُ مستخدمٍ حقيقي في سجلّ الخادم.
 */
class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  async send({ to, message }: { to: string; message: string }): Promise<void> {
    console.log(`[SMS:console] to=${to} message=${message}`);
  }
}

/** مزوّد صامت — للاختبارات: يتحقق المسار كاملاً بلا مخرجات ولا شبكة. */
class NoopSmsProvider implements SmsProvider {
  readonly name = 'noop';
  async send(): Promise<void> {
    /* لا شيء عمداً. */
  }
}

/**
 * مزوّد HTTP عام.
 *
 * أغلب مزوّدي الرسائل الإقليميين يقبلون طلب POST بسيط بالحقول نفسها
 * (المستقبِل، النص، المرسِل، المفتاح). هذا التنفيذ يغطّي ذلك الشكل ويُضبط
 * كلياً من البيئة، فلا يُخبَز اسم مزوّد في الكود. مزوّد بعقد مختلف جذرياً
 * يُضاف كصنف جديد هنا ويُسجَّل في `createSmsProvider` — بلا أي تغيير خارج
 * هذا الملف.
 */
class HttpSmsProvider implements SmsProvider {
  readonly name = 'http';

  constructor(
    private readonly settings: {
      baseUrl: string;
      apiKey: string;
      apiSecret: string;
      sender: string;
      timeoutMs: number;
    },
  ) {}

  async send({ to, message }: { to: string; message: string }): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await fetch(this.settings.baseUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.settings.apiKey}`,
          ...(this.settings.apiSecret ? { 'X-Api-Secret': this.settings.apiSecret } : {}),
        },
        body: JSON.stringify({
          to,
          message,
          sender: this.settings.sender,
        }),
      });
      if (!response.ok) {
        // نصّ الاستجابة قد يحوي معرّفات المزوّد — لا الرمز، فالرمز لا يُعاد.
        throw new SmsDeliveryError(
          `مزوّد الرسائل ردّ بحالة ${response.status}`,
        );
      }
    } catch (error) {
      if (error instanceof SmsDeliveryError) throw error;
      throw new SmsDeliveryError('تعذّر الاتصال بمزوّد الرسائل', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * بناء المزوّد من الإعدادات.
 *
 * الإنتاج يسقط هنا لا لاحقاً: مزوّد غير مضبوط يعني أن كل تسجيل سينجح
 * ظاهرياً بينما لا تصل رسالة واحدة، وهو عطلٌ صامت أسوأ من رفض الإقلاع.
 */
export function createSmsProvider(): SmsProvider {
  const { provider, baseUrl, apiKey, apiSecret, sender, timeoutMs } = config.sms;

  switch (provider) {
    case 'console':
      // الاختبار المسبق يُعامَل كالإنتاج: بيئةٌ يستعملها بشر يجب أن تُرسل
      // رسائل حقيقية، لا أن تطبع الرمز في سجلّ الخادم.
      if (config.isProduction || config.isStaging) {
        throw new Error(
          `SMS_PROVIDER=console غير مسموح في ${config.appEnv} — اضبط مزوّداً حقيقياً.`,
        );
      }
      return new ConsoleSmsProvider();

    case 'noop':
      if (config.isProduction || config.isStaging) {
        throw new Error(
          `SMS_PROVIDER=noop غير مسموح في ${config.appEnv} — لن تصل أي رسالة.`,
        );
      }
      return new NoopSmsProvider();

    case 'http': {
      const missing = [
        !baseUrl && 'SMS_BASE_URL',
        !apiKey && 'SMS_API_KEY',
        !sender && 'SMS_SENDER',
      ].filter(Boolean);
      if (missing.length > 0) {
        throw new Error(
          `SMS_PROVIDER=http ينقصه: ${missing.join(', ')}. اضبطها في البيئة.`,
        );
      }
      return new HttpSmsProvider({ baseUrl, apiKey, apiSecret, sender, timeoutMs });
    }

    default:
      throw new Error(
        `SMS_PROVIDER=${provider} غير معروف. القيم المدعومة: console, http, noop.`,
      );
  }
}

/** مزوّد كسول: يُبنى عند أول استعمال فقط، فلا تسقط الاختبارات على إعداد لا تستعمله. */
let cached: SmsProvider | null = null;

export function smsProvider(): SmsProvider {
  cached ??= createSmsProvider();
  return cached;
}

/** لإعادة البناء بعد تغيير الإعدادات في الاختبارات. */
export function resetSmsProvider(): void {
  cached = null;
}
