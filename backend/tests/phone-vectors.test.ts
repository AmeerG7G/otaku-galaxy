import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeIraqiPhone } from '../src/utils/phone.js';
import { api, purgeTestUsers } from './helpers.js';

/**
 * الجدول المشترك مع التطبيق والمتجر (`test/fixtures/iraqi_phone_vectors.json`):
 * ما يقبله العميلان يقبله الخادم ويطبّعه إلى النصّ نفسه، وما يرفضانه يرفضه —
 * فلا يتجاوز طلبٌ مباشر إلى الـAPI قاعدةَ التطبيق. الصفوف `clientOnly` (أرقام
 * شرقية) يحوّلها العميلان قبل الإرسال؛ الخادم يرفضها كما وصلت (قرار 2026-09-13).
 */
interface Row {
  raw: string;
  e164: string | null;
  clientOnly?: boolean;
}
const vectors = JSON.parse(readFileSync(new URL('../../test/fixtures/iraqi_phone_vectors.json', import.meta.url), 'utf8')) as {
  normalize: Row[];
};

describe('قاعدة الهاتف على الخادم = جدول التطبيق المشترك', () => {
  it('normalizeIraqiPhone يعطي جواب التطبيق لكل صفّ', () => {
    for (const row of vectors.normalize) {
      expect(normalizeIraqiPhone(row.raw), JSON.stringify(row.raw)).toBe(row.clientOnly ? null : row.e164);
    }
  });
});

describe('[CRITICAL] طلبٌ مباشر إلى الـAPI لا يتجاوز القاعدة', () => {
  afterAll(async () => {
    await purgeTestUsers();
  });

  const rejected = vectors.normalize.filter((row) => row.e164 === null || row.clientOnly).map((row) => row.raw);

  it('كل رقمٍ مرفوض في الجدول يُردّ بـ400 على التسجيل والدخول ونسيان كلمة المرور', async () => {
    for (const phone of rejected) {
      for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/forgot-password']) {
        const res = await api
          .post(path)
          .send({ username: 'مختبر الهاتف', phone, password: 'secret123', gender: 'male', levelKey: 'nebula' });
        expect(res.status, `${path} ${JSON.stringify(phone)}`).toBe(400);
        expect(res.body.error.code, `${path} ${JSON.stringify(phone)}`).toBe('VALIDATION_ERROR');
      }
    }
  });

  it('رقم الطلب يرفض المرفوض ويطبّع المقبول كالتطبيق', async () => {
    const { createOrderSchema } = await import('../src/validators/orders.js');
    const base = { governorateId: '00000000-0000-0000-0000-000000000000', fullAddress: 'بغداد، الكرادة، قرب الجامعة' };
    for (const row of vectors.normalize) {
      const parsed = createOrderSchema.safeParse({ ...base, phone: row.raw });
      const expected = row.clientOnly ? null : row.e164;
      expect(parsed.success ? parsed.data.phone : null, JSON.stringify(row.raw)).toBe(expected);
    }
  });
});
