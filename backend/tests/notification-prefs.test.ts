import { beforeAll, describe, expect, it } from 'vitest';
import { api, registerAndLogin } from './helpers.js';

/**
 * تفضيلات الإشعارات: دعمٌ على الخادم للتوفير بين الأجهزة.
 *
 * GET يعيد الافتراضات المدمجة مع ما خزّنه المستخدم؛ PATCH يحدّث مفتاحاً
 * واحداً ويعيد الحالة الكاملة. المفتاح محصَّن بالتعداد — أي مفتاح غريب
 * خطأ 400 لا صمتٌ خلفه تفضيل لا يُحترم.
 */
describe('تفضيلات الإشعارات', () => {
  beforeAll(async () => {
    await registerAndLogin();
  });

  function getPrefs(token: string) {
    return api.get('/api/notifications/prefs').set('Authorization', `Bearer ${token}`).expect(200);
  }

  it('يعيد الافتراضات: كل شيء مفعّل ما عدا العروض', async () => {
    const { token } = await registerAndLogin();
    const res = await getPrefs(token);
    expect(res.body.data.prefs.orders).toBe(true);
    expect(res.body.data.prefs.reviews).toBe(true);
    expect(res.body.data.prefs.stock).toBe(true);
    expect(res.body.data.prefs.offers).toBe(false);
    expect(res.body.data.prefs.points).toBe(true);
    expect(res.body.data.prefs.birthday).toBe(true);
  });

  it('مفتاح غير معروف رفضٌ واضح لا صمت', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/notifications/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'sms', enabled: false });
    expect(res.status).toBe(400);
  });

  it('حفظ تفضيل واحد يُقرأ من جديد على الفور', async () => {
    const { token } = await registerAndLogin();

    const saved = await api
      .patch('/api/notifications/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'offers', enabled: true })
      .expect(200);
    expect(saved.body.data.prefs.offers).toBe(true);

    const after = await getPrefs(token);
    expect(after.body.data.prefs.offers).toBe(true);
    // بقية الافتراضات لم تتأثر بالتحديث الجزئي.
    expect(after.body.data.prefs.orders).toBe(true);
  });

  it('إيقاف العروض صريحٌ وفوري', async () => {
    const { token } = await registerAndLogin();
    await api
      .patch('/api/notifications/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'offers', enabled: true })
      .expect(200);
    await api
      .patch('/api/notifications/prefs')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'offers', enabled: false })
      .expect(200);

    const after = await getPrefs(token);
    expect(after.body.data.prefs.offers).toBe(false);
  });

  it('بدون تسجيل دخول لا قراءة ولا حفظ', async () => {
    const read = await api.get('/api/notifications/prefs');
    expect(read.status).toBe(401);
    const write = await api.patch('/api/notifications/prefs').send({ key: 'orders', enabled: true });
    expect(write.status).toBe(401);
  });

  it('مفاتيح التطبيق الستة كلها مقبولة', async () => {
    const { token } = await registerAndLogin();
    for (const key of ['orders', 'reviews', 'stock', 'offers', 'points', 'birthday']) {
      const res = await api
        .patch('/api/notifications/prefs')
        .set('Authorization', `Bearer ${token}`)
        .send({ key, enabled: true });
      expect(res.status, key).toBe(200);
    }
  });
});