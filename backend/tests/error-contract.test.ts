import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

/**
 * عقد الأخطاء — الشكل الذي يعتمد عليه كل عميل.
 *
 * تطبيق فلاتر ولوحة التحكم يقرآن `error.code` ليقرّرا ماذا يفعلان (إعادة
 * توجيه إلى الدخول، إظهار رسالة، إعادة المحاولة). تغيير الشكل أو الرمز
 * يكسرهما بصمت: الطلب يفشل، والعميل لا يعرف لماذا فيعرض رسالة عامة.
 *
 * لم تكن هذه المسارات مغطّاة بأي اختبار قبل هذه السويت.
 */
describe('عقد استجابة الأخطاء', () => {
  it('جسم JSON فاسد → 400 بالرمز INVALID_JSON', async () => {
    const res = await api
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"phone": "0770000000",,,}');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(res.body.data).toBeNull();
  });

  it('مسار غير موجود خارج /api → 404 بالرمز NOT_FOUND', async () => {
    const res = await api.get('/does-not-exist-at-all');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  /**
   * مسار مجهول تحت `/api` يردّ 401 لا 404 — وهذا سلوك مقصود لا خلل.
   *
   * `authenticate` مركَّب على البادئة `/api` كلها، فيسبق معالجَ 404. النتيجة
   * أن غير المصادَق لا يستطيع تمييز «المسار غير موجود» من «المسار موجود
   * ويحتاج تسجيل دخول» — أي لا يستطيع رسم خريطة النقاط بالتخمين.
   *
   * موثَّق هنا لأنه بلا اختبار كان يبدو خطأً لمن يقرأ الشيفرة، فيُصلَح
   * «إصلاحاً» يفتح باب التعداد.
   */
  it('مسار مجهول تحت /api يردّ 401 لا 404 — يمنع تعداد النقاط', async () => {
    const res = await api.get('/api/does-not-exist-at-all');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('كل استجابة خطأ تحمل الشكل نفسه', async () => {
    // العميل يقرأ `success`/`data`/`message`/`error.code` دائماً — أي مسار
    // يخرج عن هذا الشكل يجعل معالجة الأخطاء في العميل تفشل بلا سبب ظاهر.
    for (const request of [
      api.get('/api/does-not-exist-at-all'),
      api.get('/api/admin/products'), // بلا توكن → 401
      api.get('/api/orders'), // بلا توكن → 401
    ]) {
      const res = await request;
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('data', null);
      expect(res.body).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code');
      expect(typeof res.body.error.code).toBe('string');
    }
  });

  it('[CRITICAL] لا تسريب لتفاصيل التنفيذ في أي رسالة خطأ', async () => {
    // رسالة الخطأ تصل الزبون. كومة الاستدعاء أو اسم الجدول أو نص الاستعلام
    // فيها تعطي مهاجماً خريطةً للنظام مجاناً.
    const leaks = [/at\s+\w+\s+\(/i, /node_modules/i, /SELECT\s/i, /pg_/i, /\.ts:\d+/];
    for (const request of [
      api.get('/api/does-not-exist-at-all'),
      api.get('/api/admin/orders'),
      api.post('/api/auth/login').send({ phone: 'not-a-phone', password: 'x' }),
    ]) {
      const res = await request;
      const serialized = JSON.stringify(res.body);
      for (const pattern of leaks) {
        expect(serialized, `تسريب في: ${serialized.slice(0, 200)}`).not.toMatch(pattern);
      }
    }
  });
});
