import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * «الخيار الأخير في أعياد الميلاد لا يُحفظ» — إعادة إنتاج (STEP 64 §15).
 *
 * البلاغ لم يسمِّ الخيار، فأُعيد إنتاج المرشّحات الثلاثة على المكدّس الحيّ
 * (الواجهة ← الحالة ← الحمولة ← الـAPI ← المدقّق ← القاعدة ← الردّ ← إعادة
 * التحميل). هذا الملف يثبّت نتيجة المرشّحين اللذين يمرّان بالخادم:
 *   (ب) إدخال الميلاد بآخر يومٍ وآخر شهر (٣١/١٢) من التطبيق،
 *   (ج) تفضيل «عيد الميلاد» — آخر التفضيلات الستّة — من إعدادات التطبيق.
 * كلاهما يُحفظ ويُعاد ويظهر: ليس هنا العطل. العطل المؤكَّد في المرشّح (أ):
 * آخر تبويبات صفحة أعياد الميلاد في اللوحة («المسجَّلون»، «الكل») خارج
 * الشاشة على الهاتف فلا يُضغط، والاختيار كلّه يضيع بإعادة التحميل — انظر
 * `admin/src/pages/BirthdaysPage.test.tsx`.
 */
describe('birthday "last option" — backend candidates (b) and (c) persist end to end', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeTestUsers();
  });

  async function eligibleCustomer() {
    const user = await registerAndLogin();
    await api.post('/api/cart').set('Authorization', `Bearer ${user.token}`).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' })
      .expect(201);
    for (const status of ['OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${order.body.data.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(200);
    }
    return user;
  }

  it('(b) the last day of the last month — 31/12 — saves, survives reload, and reaches the dashboard list', async () => {
    const user = await eligibleCustomer();
    // الحمولة نفسها التي يرسلها `birthday_prompt.dart`: أرقامٌ لا نصوص.
    const saved = await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ day: 31, month: 12 })
      .expect(200);
    expect(saved.body.data).toMatchObject({ hasBirthday: true, day: 31, month: 12 });

    const row = await db.query('SELECT birth_day, birth_month FROM users WHERE id = $1', [user.userId]);
    expect(row.rows[0]).toEqual({ birth_day: 31, birth_month: 12 });

    // «إعادة التحميل»: قراءةٌ جديدة من الخادم.
    const reread = await api.get('/api/birthday').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(reread.body.data).toMatchObject({ hasBirthday: true, day: 31, month: 12 });

    const listed = await api
      .get('/api/admin/customers/birthdays?filter=registered&limit=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const mine = listed.body.data.items.find((c: { id: string }) => c.id === user.userId);
    expect(mine).toMatchObject({ birthDay: 31, birthMonth: 12, isRegistered: true });
  });

  it('(b) every month boundary the form allows is accepted (31/1 … 31/12, 29/2); impossible days are refused', async () => {
    for (const [day, month] of [[31, 1], [29, 2], [30, 4], [31, 12]] as const) {
      const user = await eligibleCustomer();
      await api.post('/api/birthday').set('Authorization', `Bearer ${user.token}`).send({ day, month }).expect(200);
    }
    const user = await eligibleCustomer();
    const bad = await api.post('/api/birthday').set('Authorization', `Bearer ${user.token}`).send({ day: 31, month: 11 });
    expect(bad.status).toBe(422);
  });

  it('(c) the last notification preference «birthday» saves, survives reload, and stays independent of the others', async () => {
    const user = await registerAndLogin();
    const off = await api
      .patch('/api/notifications/prefs')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key: 'birthday', enabled: false })
      .expect(200);
    expect(off.body.data.prefs.birthday).toBe(false);

    const reread = await api.get('/api/notifications/prefs').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(reread.body.data.prefs).toEqual({
      orders: true,
      reviews: true,
      stock: true,
      offers: false,
      points: true,
      birthday: false,
    });

    await api.patch('/api/notifications/prefs').set('Authorization', `Bearer ${user.token}`).send({ key: 'birthday', enabled: true }).expect(200);
    const back = await api.get('/api/notifications/prefs').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(back.body.data.prefs.birthday).toBe(true);
  });

  it('(a) the dashboard\'s last options reach the API intact: filter=all and windowDays=30', async () => {
    for (const query of ['filter=all', 'filter=registered', 'filter=upcoming&windowDays=30', 'filter=recent&windowDays=30']) {
      const res = await api.get(`/api/admin/customers/birthdays?${query}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
      if (query.includes('windowDays=30')) expect(res.body.data.counts.windowDays).toBe(30);
    }
  });
});
