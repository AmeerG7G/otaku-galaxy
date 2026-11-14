import { describe, expect, it } from 'vitest';
import { parseMetaWebhook, signMetaPayload, verifyMetaSignature } from '../src/services/whatsapp/metaWebhook.js';
import { metaSendPayload } from '../src/services/whatsapp/provider.js';
import { extractSignupCode, generateSignupCode, maskPhone } from '../src/services/whatsappSignupService.js';

/**
 * وحدات التحقق عبر واتساب بلا قاعدة ولا شبكة: الرمز، التوقيع، تحليل حمولة Meta،
 * وحمولة الإرسال. الحمولات بصيغة وثائق Meta (2026-11-14) — تُراجَع بحمولةٍ
 * حقيقية في المرحلة D.
 */

describe('رمز التسجيل', () => {
  it('١٠ محارف Crockford بصيغة OG-XXXXX-XXXXX، بلا تكرارٍ في ألف رمز', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const { normalized, display } = generateSignupCode();
      expect(normalized).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(display).toBe(`OG-${normalized.slice(0, 5)}-${normalized.slice(5)}`);
      seen.add(normalized);
    }
    expect(seen.size).toBe(1000);
  });

  it('يُستخرج من أي موضع، بأي حالة أحرف، بفراغاتٍ أو شرطات، ويُطبَّع وفق Crockford', () => {
    expect(extractSignupCode('أؤكد أنني أنشئ حسابي. الرمز: OG-AB12C-DE34F')).toBe('AB12CDE34F');
    expect(extractSignupCode('og ab12c de34f')).toBe('AB12CDE34F');
    expect(extractSignupCode('کۆد: OG–AB12C–DE34F سوپاس')).toBe('AB12CDE34F');
    expect(extractSignupCode('OG-ABI2C-DEL4O')).toBe('AB12CDE140');
    expect(extractSignupCode('OG-AB١٢C-DE٣٤F')).toBe('AB12CDE34F');
  });

  it('لا رمز في نصٍّ عادي أو رمزٍ ناقص أو زائد', () => {
    expect(extractSignupCode('مرحبا')).toBeNull();
    expect(extractSignupCode('OG-AB12C-DE34')).toBeNull();
    expect(extractSignupCode('OG-AB12C-DE34FG')).toBeNull();
  });

  it('إخفاء الرقم في السجلّ', () => {
    expect(maskPhone('+9647701234567')).toBe('+9647…67');
  });
});

describe('[SECURITY] توقيع X-Hub-Signature-256', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  it('الصحيح يمرّ؛ السرّ الآخر والجسم المعدَّل والصيغ الخاطئة لا', () => {
    const sig = signMetaPayload(body, 'app-secret');
    expect(verifyMetaSignature(body, sig, 'app-secret')).toBe(true);
    expect(verifyMetaSignature(body, sig.toUpperCase().replace('SHA256', 'sha256'), 'app-secret')).toBe(true);
    expect(verifyMetaSignature(body, sig, 'other')).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body.toString() + ' '), sig, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, sig.replace('sha256=', ''), 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, '')).toBe(false);
  });
});

const wrap = (value: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'W', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'P1' }, ...value } }] }],
});

describe('تحليل حمولة Meta', () => {
  it('نصٌّ برقمٍ ومعرّف', () => {
    const [event] = parseMetaWebhook(wrap({
      contacts: [{ wa_id: '9647701234567', user_id: 'IQ.1' }],
      messages: [{ from: '9647701234567', from_user_id: 'IQ.1', id: 'wamid.1', timestamp: '1749416383', type: 'text', text: { body: 'hi' } }],
    }));
    expect(event).toEqual({
      kind: 'text', eventId: 'wamid.1', senderPhone: '9647701234567', senderRef: 'IQ.1', text: 'hi', sentAt: new Date(1749416383 * 1000),
    });
  });

  it('اسم مستخدم: لا رقم، المعرّف وحده', () => {
    const [event] = parseMetaWebhook(wrap({
      contacts: [{ user_id: 'IQ.2', profile: { username: '@otaku' } }],
      messages: [{ from_user_id: 'IQ.2', id: 'wamid.2', timestamp: '1749416383', type: 'text', text: { body: 'x' } }],
    }));
    expect(event).toMatchObject({ kind: 'text', senderRef: 'IQ.2' });
    expect((event as { senderPhone?: string }).senderPhone).toBeUndefined();
  });

  it('[SECURITY] ردّ الزرّ وحده يُقبل؛ البطاقة اليدوية والمتعدّدة والبلا origin تُهمَل', () => {
    const contact = (c: Record<string, unknown>) =>
      parseMetaWebhook(wrap({ messages: [{ from_user_id: 'IQ.3', id: 'wamid.c', timestamp: '1749416383', type: 'contacts', contacts: c.list ?? [c] }] }))[0];
    const phones = [{ phone: '+964 770 123 4567', wa_id: '9647701234567', type: 'MOBILE' }];
    expect(contact({ origin: 'contact_request', phones })).toMatchObject({ kind: 'contact_request_reply', sharedWaId: '9647701234567', senderRef: 'IQ.3' });
    expect(contact({ origin: 'other', phones })).toMatchObject({ kind: 'ignored' });
    expect(contact({ phones })).toMatchObject({ kind: 'ignored' });
    expect(contact({ list: [{ origin: 'contact_request', phones }, { origin: 'contact_request', phones }] })).toMatchObject({ kind: 'ignored' });
    expect(contact({ origin: 'contact_request', phones: [...phones, { wa_id: '9647709999999' }] })).toMatchObject({ kind: 'ignored' });
  });

  it('رقم عملٍ آخر، حالات الإرسال، أنواعٌ مجهولة، حمولاتٌ مشوّهة', () => {
    const msg = { from: '9647701234567', id: 'wamid.4', timestamp: '1749416383', type: 'text', text: { body: 'x' } };
    expect(parseMetaWebhook(wrap({ messages: [msg] }), 'P2')).toEqual([]);
    expect(parseMetaWebhook(wrap({ messages: [msg] }), 'P1')).toHaveLength(1);
    expect(parseMetaWebhook(wrap({ statuses: [{ id: 'wamid.s', status: 'delivered' }] }))).toEqual([]);
    expect(parseMetaWebhook(wrap({ messages: [{ ...msg, type: 'image', text: undefined }] }))[0]).toMatchObject({ kind: 'ignored', type: 'image' });
    expect(parseMetaWebhook(wrap({ messages: [{ ...msg, timestamp: 'soon' }] }))[0]).toMatchObject({ kind: 'ignored' });
    expect(parseMetaWebhook(wrap({ messages: [{ ...msg, id: undefined }] }))).toEqual([]);
    for (const bad of [null, 'x', [], { object: 'page' }, { object: 'whatsapp_business_account', entry: 'x' }]) {
      expect(parseMetaWebhook(bad)).toEqual([]);
    }
  });
});

describe('حمولة الإرسال إلى Graph API', () => {
  it('زرّ مشاركة الرقم إلى BSUID، والتأكيد إلى الرقم حين لا معرّف', () => {
    expect(metaSendPayload({ kind: 'contact_request', recipient: { bsuid: 'IQ.9' }, bodyText: 'b' })).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      recipient: 'IQ.9',
      type: 'interactive',
      interactive: { type: 'request_contact_info', body: { text: 'b' }, action: { name: 'request_contact_info' } },
    });
    expect(metaSendPayload({ kind: 'confirmation', recipient: { phone: '+9647701234567' }, bodyText: 't' })).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '9647701234567', type: 'text', text: { body: 't' },
    });
  });
});
