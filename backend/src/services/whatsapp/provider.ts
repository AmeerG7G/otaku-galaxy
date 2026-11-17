import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/index.js';
import { parseMetaWebhook, verifyMetaSignature, type InboundEvent } from './metaWebhook.js';

/**
 * مزوّد واتساب — طبقةٌ واحدة يمكن استبدالها دون مسّ التسجيل.
 *
 * `meta`    : WhatsApp Cloud API الرسمية (Graph API) — المرحلة D وما بعدها.
 * `fixture` : التطوير والاختبار وحدهما. **الصيغة نفسها** (توقيع Meta وحمولتها)
 *             فيمرّ مسار الويبهوك كلّه كما في الحقيقة؛ الفرق الوحيد أن الإرسال
 *             يُحفظ في الذاكرة بدل أن يخرج. مرفوضٌ في staging/prod عند الإقلاع.
 */

export type OutboundMessage =
  | { kind: 'contact_request'; recipient: { bsuid?: string; phone?: string }; bodyText: string }
  | { kind: 'confirmation'; recipient: { bsuid?: string; phone?: string }; bodyText: string };

export interface WhatsAppProvider {
  readonly name: 'meta' | 'fixture';
  /** ردّ مصافحة الاشتراك — `hub.challenge` أو `null` (= 403). */
  handshake(query: Record<string, unknown>): string | null;
  verifySignature(rawBody: Buffer, signatureHeader: unknown): boolean;
  parse(rawBody: Buffer): InboundEvent[];
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

/** خطأ إرسال برمزٍ قصير لا يحمل رقماً ولا توكناً — هو ما يُخزَّن في `last_error_code`. */
export class WhatsAppSendError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(`whatsapp send failed: ${code}`);
    this.name = 'WhatsAppSendError';
  }
}

/**
 * [SECURITY] مقارنة رمز المصافحة بزمنٍ ثابت: تجزئة الطرفين أولاً فيتساوى الطول
 * دائماً، ولا يكشف زمن الردّ طول الرمز المضبوط ولا أوّل محرفٍ يختلف.
 */
function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function handshake(query: Record<string, unknown>): string | null {
  const expected = config.whatsapp.verifyToken;
  if (!expected) return null;
  if (query['hub.mode'] !== 'subscribe') return null;
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (typeof token !== 'string' || !sameToken(token, expected)) return null;
  if (typeof challenge !== 'string' || !/^[\w-]{1,128}$/.test(challenge)) return null;
  return challenge;
}

function parse(rawBody: Buffer): InboundEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    // [SECURITY] لا شيء من الجسم في السجلّ — موقَّعٌ لكنه ليس JSON.
    console.warn('[whatsapp-webhook] signed payload is not valid JSON — ignored');
    return [];
  }
  return parseMetaWebhook(payload, config.whatsapp.phoneNumberId || undefined);
}

/** الحمولة الصادرة بصيغة Graph API — مستخرجةٌ ليختبرها الاختبار بلا شبكة. */
export function metaSendPayload(message: OutboundMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { messaging_product: 'whatsapp', recipient_type: 'individual' };
  // [META] الإرسال إلى BSUID عبر `recipient`؛ `to` يتقدّم إن حضر الاثنان، فلا نرسل الاثنين.
  if (message.recipient.bsuid) base.recipient = message.recipient.bsuid;
  else if (message.recipient.phone) base.to = message.recipient.phone.replace(/^\+/, '');
  if (message.kind === 'contact_request') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'request_contact_info',
        body: { text: message.bodyText },
        action: { name: 'request_contact_info' },
      },
    };
  }
  return { ...base, type: 'text', text: { body: message.bodyText } };
}

const metaProvider: WhatsAppProvider = {
  name: 'meta',
  handshake,
  verifySignature: (raw, header) => verifyMetaSignature(raw, header, config.whatsapp.appSecret),
  parse,
  async send(message) {
    const { graphApiVersion, phoneNumberId, accessToken, sendTimeoutMs } = config.whatsapp;
    if (!message.recipient.bsuid && !message.recipient.phone) throw new WhatsAppSendError('no_recipient', false);
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${encodeURIComponent(graphApiVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(metaSendPayload(message)),
          signal: AbortSignal.timeout(sendTimeoutMs),
        },
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      throw new WhatsAppSendError(name === 'TimeoutError' ? 'timeout' : 'network', true);
    }
    // [SECURITY] جسم الخطأ قد يحمل الرقم — لا يُقرأ إلى السجلّ؛ الحالة وحدها.
    if (!response.ok) {
      throw new WhatsAppSendError(`http_${response.status}`, response.status === 429 || response.status >= 500);
    }
    const body = (await response.json().catch(() => null)) as { messages?: { id?: unknown }[] } | null;
    const id = body?.messages?.[0]?.id;
    return { providerMessageId: typeof id === 'string' ? id : 'unknown' };
  },
};

/** ما «أرسله» مزوّد `fixture` — تقرؤه الاختبارات وتفرّغه. لا يُكتب إلى السجلّ. */
export const fixtureSent: OutboundMessage[] = [];
let fixtureFailure: WhatsAppSendError | null = null;

/** يجعل الإرسال التالي يفشل (اختبار تعطّل المزوّد). `null` يعيد النجاح. */
export function setFixtureSendFailure(error: WhatsAppSendError | null) {
  fixtureFailure = error;
}

const fixtureProvider: WhatsAppProvider = {
  name: 'fixture',
  handshake,
  verifySignature: (raw, header) => verifyMetaSignature(raw, header, config.whatsapp.appSecret),
  parse,
  async send(message) {
    if (fixtureFailure) throw fixtureFailure;
    fixtureSent.push(message);
    return { providerMessageId: `fixture.${fixtureSent.length}` };
  },
};

export function whatsappProvider(): WhatsAppProvider {
  return config.whatsapp.provider === 'meta' ? metaProvider : fixtureProvider;
}
