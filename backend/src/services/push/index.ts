import { config } from '../../config/index.js';

/**
 * حدّ التماس مع مزوّد الإشعارات الفورية.
 *
 * يتبع نمط `services/sms/index.ts` حرفياً — نفس الفكرة ونفس الضمانات: بقية
 * النظام لا تعرف أي مزوّد بعينه، وتبديله إعدادٌ لا إعادة كتابة.
 */
export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  /** بيانات التوجيه (فتح طلب بعينه مثلاً) — تصل التطبيق كما هي. */
  data?: Record<string, string>;
}

/** نتيجة الإرسال: كم وصل، وأي الرموز رفضها المزوّد. */
export interface PushResult {
  sent: number;
  /** رموز ردّ المزوّد بأنها غير صالحة/منتهية — تُعطَّل عند المستدعي. */
  invalidTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}

export class PushDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PushDeliveryError';
  }
}

/** مزوّد التطوير: يطبع بدل أن يرسل. ممنوع خارج التطوير. */
class ConsolePushProvider implements PushProvider {
  readonly name = 'console';

  async send({ tokens, title }: PushMessage): Promise<PushResult> {
    console.log(`[push:console] ${tokens.length} جهاز — «${title}»`);
    return { sent: tokens.length, invalidTokens: [] };
  }
}

/** مزوّد صامت — للاختبارات: يتحقق المسار كاملاً بلا شبكة. */
class NoopPushProvider implements PushProvider {
  readonly name = 'noop';
  async send(): Promise<PushResult> {
    return { sent: 0, invalidTokens: [] };
  }
}

/**
 * Firebase Cloud Messaging عبر HTTP v1.
 *
 * [CRITICAL] لا مفاتيح في الشيفرة. الاعتماد كلّه من البيئة، والإقلاع يسقط
 * إن نقص شيء منه (انظر `createPushProvider`).
 *
 * التنفيذ هنا **بنيةٌ كاملة بلا اعتماد حقيقي**: يبني الطلب ويقرأ الردّ
 * ويستخرج الرموز غير الصالحة. ما ينقصه هو رمز وصول OAuth2 مُوقَّع بحساب
 * الخدمة — وهو ما لا يمكن توليده بلا ملف الاعتماد الحقيقي. الدالة
 * [obtainAccessToken] هي نقطة الوصل تلك، وتُرمى صراحةً بدل أن تُرجع قيمة
 * وهمية توحي بأن الإرسال يعمل.
 */
class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';

  constructor(
    private readonly settings: {
      projectId: string;
      clientEmail: string;
      privateKey: string;
      timeoutMs: number;
    },
  ) {}

  /**
   * رمز وصول OAuth2 لحساب الخدمة.
   *
   * [غير منفَّذ عمداً] يتطلّب توقيع JWT بمفتاح حساب الخدمة الخاص ثم تبادله
   * مع Google. تنفيذُه بلا اعتماد حقيقي يعني كتابة توقيعٍ لا يمكن التحقق
   * منه، فيُترك صريحاً: من يضبط الاعتماد يكمل هذه الدالة (أو يستبدل الصنف
   * بـ`firebase-admin`) وكل ما عداها جاهز.
   */
  private async obtainAccessToken(): Promise<string> {
    throw new PushDeliveryError(
      'رمز وصول FCM غير منفَّذ — أكمل obtainAccessToken بعد ضبط اعتماد حساب الخدمة.',
    );
  }

  async send({ tokens, title, body, data }: PushMessage): Promise<PushResult> {
    if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

    const accessToken = await this.obtainAccessToken();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${this.settings.projectId}/messages:send`;

    let sent = 0;
    const invalidTokens: string[] = [];

    // FCM v1 يرسل رسالةً لجهاز واحد في الطلب الواحد؛ رمزٌ فاسد لا يُفشل
    // البقية — يُسجَّل ويُكمَل.
    for (const token of tokens) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: { token, notification: { title, body }, data: data ?? {} },
          }),
        });

        if (response.ok) {
          sent += 1;
        } else if (response.status === 404 || response.status === 400) {
          // الرمز غير مسجَّل أو فاسد — يُعطَّل عند المستدعي.
          invalidTokens.push(token);
        }
      } catch {
        // انقطاع شبكة أو مهلة: لا يُعطَّل الرمز — العطل في الطريق لا فيه.
      } finally {
        clearTimeout(timer);
      }
    }

    return { sent, invalidTokens };
  }
}

/**
 * بناء المزوّد من الإعدادات — يسقط الإقلاع بدل العمل الصامت.
 *
 * مزوّدٌ غير مضبوط في الإنتاج يعني أن كل إشعار «يُرسل» بنجاح ظاهري ولا يصل
 * هاتفاً واحداً؛ وهو عطلٌ صامت لا يكتشفه أحد إلا من الزبائن.
 */
export function createPushProvider(): PushProvider {
  const { provider, projectId, clientEmail, privateKey, timeoutMs } = config.push;

  switch (provider) {
    case 'console':
      if (config.isProduction || config.isStaging) {
        throw new Error(
          `PUSH_PROVIDER=console غير مسموح في ${config.appEnv} — اضبط مزوّداً حقيقياً.`,
        );
      }
      return new ConsolePushProvider();

    case 'noop':
      if (config.isProduction || config.isStaging) {
        throw new Error(
          `PUSH_PROVIDER=noop غير مسموح في ${config.appEnv} — لن يصل أي إشعار.`,
        );
      }
      return new NoopPushProvider();

    case 'fcm': {
      const missing = [
        !projectId && 'FCM_PROJECT_ID',
        !clientEmail && 'FCM_CLIENT_EMAIL',
        !privateKey && 'FCM_PRIVATE_KEY',
      ].filter(Boolean);
      if (missing.length > 0) {
        throw new Error(
          `PUSH_PROVIDER=fcm ينقصه: ${missing.join(', ')}. اضبطها في البيئة.`,
        );
      }
      return new FcmPushProvider({ projectId, clientEmail, privateKey, timeoutMs });
    }

    default:
      throw new Error(
        `PUSH_PROVIDER=${provider} غير معروف. القيم المدعومة: fcm, console, noop.`,
      );
  }
}

/** مزوّد كسول — يُبنى عند أول استعمال فقط. */
let cached: PushProvider | null = null;

export function pushProvider(): PushProvider {
  cached ??= createPushProvider();
  return cached;
}

/** لإعادة البناء بعد تغيير الإعدادات في الاختبارات. */
export function resetPushProvider(): void {
  cached = null;
}
