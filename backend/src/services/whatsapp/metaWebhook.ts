import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ويبهوك WhatsApp Cloud API — التحقق من التوقيع وتحليل الحمولة. دوالّ نقيّة
 * بلا قاعدة ولا شبكة، يختبرها `whatsapp-webhook.test.ts` مباشرةً.
 *
 * المراجع (وثائق Meta الرسمية، قُرئت 2026-11-14):
 * - التوقيع: `X-Hub-Signature-256: sha256=<HMAC-SHA256(app secret, الجسم الخام)>`.
 * - المرسِل: `messages[].from` قد يغيب (مستخدم اسم مستخدم بلا تفاعلٍ سابق)،
 *   و`messages[].from_user_id` (BSUID) حاضرٌ دائماً.
 * - ردّ زرّ «مشاركة الرقم»: رسالة `type: "contacts"` و`contacts[].origin`
 *   = `contact_request` (لا `other` = بطاقة جهة اتصال أُرسلت يدوياً).
 *   ⚠ هذا الحقل موثَّق في صفحة BSUID وحدها لا في مرجع ويبهوك contacts —
 *   يُتحقَّق منه بحمولةٍ حقيقية في المرحلة D قبل الاعتماد عليه.
 */

export type InboundEvent =
  | {
      kind: 'text';
      eventId: string;
      /** أرقام بلا `+` كما ترسلها Meta، أو غائب. */
      senderPhone?: string;
      senderRef?: string;
      text: string;
      sentAt: Date;
    }
  | {
      kind: 'contact_request_reply';
      eventId: string;
      senderRef?: string;
      senderPhone?: string;
      sharedWaId: string;
      sentAt: Date;
    }
  | { kind: 'ignored'; eventId: string; type: string };

/** مقارنة التوقيع بزمنٍ ثابت — الجسم **الخام** لا JSON معاد تسلسله. */
export function verifyMetaSignature(rawBody: Buffer, header: unknown, appSecret: string): boolean {
  if (!appSecret || typeof header !== 'string') return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(match[1]!, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** يوقّع جسماً كما توقّعه Meta — للاختبارات وسكربت التطوير. */
export function signMetaPayload(rawBody: string | Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/**
 * رقم واتساب كما ترسله Meta في `from`/`wa_id`: أرقام E.164 بلا `+` (٧–١٥).
 * [SECURITY] أي قيمةٍ أخرى — BSUID مثل `IQ.…` أو اسم مستخدم — **ليست رقماً**
 * فتُعامَل كأن الرقم غائب، ولا تصل مقارنة رقم الجلسة أبداً.
 */
const waPhone = (v: unknown): string | undefined => {
  const s = str(v);
  return s && /^\d{7,15}$/.test(s) ? s : undefined;
};

function parseTimestamp(raw: unknown): Date | null {
  const s = typeof raw === 'number' ? String(raw) : str(raw);
  if (!s || !/^\d{1,12}$/.test(s)) return null;
  const date = new Date(Number(s) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * يحلّل حمولة الويبهوك إلى أحداث. لا يرمي على نوعٍ مجهول — يعيده `ignored`.
 *
 * `expectedPhoneNumberId`: إن ضُبط، تُتجاهَل رسائل أرقام العمل الأخرى في الحساب
 * نفسه (تطبيق Meta واحد قد يخدم أكثر من رقم).
 */
export function parseMetaWebhook(payload: unknown, expectedPhoneNumberId?: string): InboundEvent[] {
  if (!isObj(payload) || payload.object !== 'whatsapp_business_account') return [];
  const events: InboundEvent[] = [];
  for (const entry of arr(payload.entry)) {
    if (!isObj(entry)) continue;
    for (const change of arr(entry.changes)) {
      if (!isObj(change) || change.field !== 'messages' || !isObj(change.value)) continue;
      const value = change.value;
      const metadata = isObj(value.metadata) ? value.metadata : {};
      if (expectedPhoneNumberId && str(metadata.phone_number_id) !== expectedPhoneNumberId) continue;

      // `contacts[]` على مستوى القيمة: ملفّ المرسِل (wa_id/user_id) — احتياطٌ إن غاب حقل الرسالة.
      const profiles = arr(value.contacts).filter(isObj);
      // الملفّ الوحيد احتياطٌ فقط إن لم يناقض الرسالة: معرّفٌ أو رقمٌ آخر = ملفّ غيره.
      const consistent = (p: Json, ref?: string, phone?: string) =>
        (!ref || !str(p.user_id) || str(p.user_id) === ref) && (!phone || !str(p.wa_id) || str(p.wa_id) === phone);
      const profileFor = (ref?: string, phone?: string) =>
        profiles.find((p) => (ref && str(p.user_id) === ref) || (phone && waPhone(p.wa_id) === phone)) ??
        (profiles.length === 1 && consistent(profiles[0]!, ref, phone) ? profiles[0] : undefined);

      for (const message of arr(value.messages)) {
        if (!isObj(message)) continue;
        const eventId = str(message.id);
        if (!eventId) continue;
        const type = str(message.type) ?? 'unknown';
        const sentAt = parseTimestamp(message.timestamp);
        let senderRef = str(message.from_user_id);
        let senderPhone = waPhone(message.from);
        const profile = profileFor(senderRef, senderPhone);
        senderRef ??= profile ? str(profile.user_id) : undefined;
        senderPhone ??= profile ? waPhone(profile.wa_id) : undefined;
        if (!sentAt) {
          events.push({ kind: 'ignored', eventId, type: `${type}:no_timestamp` });
          continue;
        }

        if (type === 'text' && isObj(message.text)) {
          const body = typeof message.text.body === 'string' ? message.text.body : '';
          events.push({ kind: 'text', eventId, senderPhone, senderRef, text: body, sentAt });
          continue;
        }

        if (type === 'contacts') {
          const shared = arr(message.contacts).filter(isObj);
          // [SECURITY] ردّ الزرّ وحده — بطاقةٌ أُرسلت يدوياً قد تحمل رقم غيره.
          // جهةٌ واحدة، `origin` صريح، ورقمٌ واحدٌ بمعرّف واتساب.
          const only = shared.length === 1 ? shared[0]! : undefined;
          const phones = only ? arr(only.phones).filter(isObj) : [];
          const waIds = phones.map((p) => waPhone(p.wa_id)).filter((v): v is string => !!v);
          if (only && str(only.origin) === 'contact_request' && waIds.length === 1) {
            events.push({ kind: 'contact_request_reply', eventId, senderRef, senderPhone, sharedWaId: waIds[0]!, sentAt });
          } else {
            events.push({ kind: 'ignored', eventId, type: 'contacts:not_contact_request' });
          }
          continue;
        }

        events.push({ kind: 'ignored', eventId, type });
      }
      // حالات الرسائل الصادرة (sent/delivered/read/failed) لا تغيّر جلسةً — لا تُسجَّل.
    }
  }
  return events;
}
