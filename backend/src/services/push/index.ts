import jwt from 'jsonwebtoken';
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
  /**
   * رسالة بيانات لا إشعار: يعرضها العميل بنفسه (عامل خدمة اللوحة، ليضبط
   * رابط النقر). غيابه = إشعارٌ يعرضه نظام الهاتف ولو كان التطبيق مغلقاً.
   */
  dataOnly?: boolean;
}

/** نتيجة الإرسال: كم وصل، وأي الرموز رفضها المزوّد. */
export interface PushResult {
  sent: number;
  /** رموز ردّ المزوّد بأنها غير صالحة/منتهية — تُعطَّل عند المستدعي. */
  invalidTokens: string[];
  /** رموز فشلت لعطلٍ عابر (شبكة، مهلة، 429، 5xx) — يُعاد إرسالها لاحقاً. */
  transientFailures?: number;
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

/** تبادل رمز الوصول لحساب الخدمة (OAuth2 JWT bearer). */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** قناة أندرويد الافتراضية — يُنشئها التطبيق بالاسم نفسه عند الإقلاع. */
export const ANDROID_CHANNEL_ID = 'otaku_default';

/**
 * رفضُ FCM لرمزٍ بعينه لا للرسالة: الرمز لم يعد مسجَّلاً، أو ليس رمزاً أصلاً،
 * أو يخصّ مشروع Firebase آخر. هذه وحدها تُعطِّل الرمز. أيُّ ٤٠٠ آخر (حمولة
 * فاسدة) خطأٌ فينا — تعطيل الرموز عليه كان سيُسقط أجهزة الزبائن كلها بسبب علّة
 * في الشيفرة.
 */
function isTokenRejection(status: number, payload: unknown): boolean {
  if (status === 404) return true;
  const error = (payload as { error?: { status?: string; message?: string; details?: unknown[] } })?.error;
  const codes = (error?.details ?? [])
    .map((detail) => (detail as { errorCode?: string })?.errorCode)
    .filter(Boolean);
  if (codes.includes('UNREGISTERED') || codes.includes('SENDER_ID_MISMATCH')) return true;
  return (
    status === 400 &&
    error?.status === 'INVALID_ARGUMENT' &&
    /registration token/i.test(error?.message ?? '')
  );
}

/**
 * Firebase Cloud Messaging عبر HTTP v1 — بلا مكتبة إضافية ولا خدمة مدفوعة.
 *
 * [CRITICAL] لا مفاتيح في الشيفرة. الاعتماد كلّه من البيئة
 * (`FCM_PROJECT_ID`، `FCM_CLIENT_EMAIL`، `FCM_PRIVATE_KEY`).
 *
 * رمز الوصول: تأكيد JWT موقَّع RS256 بمفتاح حساب الخدمة يُبادَل عند Google
 * برمز وصول يعيش ساعة؛ يُخبَّأ ويُجدَّد قبل انتهائه بدقيقة، ويُمسح عند ٤٠١.
 * كل نداء شبكة (التبادل والإرسال) له مهلة `PUSH_TIMEOUT_MS`.
 */
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly settings: {
      projectId: string;
      clientEmail: string;
      privateKey: string;
      timeoutMs: number;
    },
    private readonly now: () => number = Date.now,
  ) {}

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** رمز وصول OAuth2 لحساب الخدمة — مخبّأ حتى قبل انتهائه بستين ثانية. */
  async obtainAccessToken(): Promise<string> {
    const now = this.now();
    if (this.accessToken && now < this.accessToken.expiresAt - 60_000) {
      return this.accessToken.value;
    }
    let assertion: string;
    try {
      const iat = Math.floor(now / 1000);
      assertion = jwt.sign(
        { iss: this.settings.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 },
        this.settings.privateKey,
        { algorithm: 'RS256' },
      );
    } catch (error) {
      // مفتاحٌ فاسد في البيئة: لا يُطبع المفتاح، يُقال إنه فاسد.
      throw new PushDeliveryError('FCM_PRIVATE_KEY غير صالح لتوقيع RS256', { cause: error });
    }
    let response: Response;
    try {
      response = await this.fetchWithTimeout(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
      });
    } catch (error) {
      throw new PushDeliveryError('تعذّر الوصول إلى خادم رموز Google', { cause: error });
    }
    if (!response.ok) {
      throw new PushDeliveryError(`رفض تبادل رمز وصول FCM (HTTP ${response.status})`);
    }
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof payload.access_token !== 'string' || !payload.access_token) {
      throw new PushDeliveryError('ردّ تبادل الرمز بلا access_token');
    }
    const ttlSeconds = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    this.accessToken = { value: payload.access_token, expiresAt: now + ttlSeconds * 1000 };
    return payload.access_token;
  }

  private messageFor(token: string, { title, body, data, dataOnly }: PushMessage) {
    const payloadData = data ?? {};
    if (dataOnly) {
      // عامل خدمة اللوحة يعرض الإشعار بنفسه من هذه الحقول.
      return {
        token,
        data: { ...payloadData, title, body },
        webpush: { headers: { Urgency: 'high' } },
        android: { priority: 'HIGH' as const },
      };
    }
    return {
      token,
      notification: { title, body },
      data: payloadData,
      android: {
        priority: 'HIGH' as const,
        // النقر يفتح نشاط التطبيق الافتراضي؛ `firebase_messaging` يسلّمه
        // الرسالة (`getInitialMessage`/`onMessageOpenedApp`) فيوجّه منها.
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    };
  }

  async send(message: PushMessage): Promise<PushResult> {
    const { tokens } = message;
    if (tokens.length === 0) return { sent: 0, invalidTokens: [], transientFailures: 0 };

    const endpoint = `https://fcm.googleapis.com/v1/projects/${this.settings.projectId}/messages:send`;
    let sent = 0;
    let transientFailures = 0;
    const invalidTokens: string[] = [];

    // FCM v1 يرسل رسالةً لجهاز واحد في الطلب الواحد؛ رمزٌ فاسد لا يُفشل
    // البقية — يُسجَّل ويُكمَل.
    for (const token of tokens) {
      const accessToken = await this.obtainAccessToken();
      let response: Response;
      try {
        response = await this.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: this.messageFor(token, message) }),
        });
      } catch {
        // انقطاع شبكة أو مهلة: لا يُعطَّل الرمز — العطل في الطريق لا فيه.
        transientFailures += 1;
        continue;
      }
      if (response.ok) {
        sent += 1;
        continue;
      }
      const payload = await response.json().catch(() => null);
      if (isTokenRejection(response.status, payload)) {
        invalidTokens.push(token);
      } else {
        // ٤٠١: رمز الوصول انتهى أو أُلغي — يُمسح ليُطلب جديدٌ في المحاولة التالية.
        if (response.status === 401) this.accessToken = null;
        transientFailures += 1;
      }
    }

    return { sent, invalidTokens, transientFailures };
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

/**
 * حالة الدفع لهذه البيئة — للمهمّة ولوحة التحكم.
 *
 * لا ترمي: اعتمادٌ ناقص يعني `configured: false` وسبباً مقروءاً، لا انهيار
 * المهمّة ولا طلب اللوحة. الإشعارات داخل التطبيق لا تتأثر.
 */
export function pushStatus(): { configured: boolean; provider: PushProvider | null; reason: string | null } {
  try {
    return { configured: true, provider: pushProvider(), reason: null };
  } catch (error) {
    return {
      configured: false,
      provider: null,
      reason: error instanceof Error ? error.message : 'push_not_configured',
    };
  }
}
