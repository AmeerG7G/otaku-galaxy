import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';
import { deviceTokenRepo } from '../src/repositories/deviceTokenRepo.js';

/**
 * الإشعارات الفورية — تسجيل الأجهزة والإرسال.
 *
 * الضمانة الجوهرية: الرمز يخصّ صاحب الجلسة وحده. لا مسار يقبل معرّف مستخدم
 * من العميل، ولا يستطيع مستخدمٌ أن يجعل جهازه يستقبل إشعارات غيره.
 */
describe('أجهزة الإشعارات الفورية', () => {
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const FCM_A = 'fcm-token-alice-'.padEnd(60, 'a');
  const FCM_B = 'fcm-token-bob-'.padEnd(60, 'b');

  beforeAll(async () => {
    alice = await registerAndLogin();
    bob = await registerAndLogin();
  });

  afterAll(async () => {
    await db.query('DELETE FROM device_tokens WHERE token LIKE $1', ['fcm-token-%']);
    await purgeTestUsers();
  });

  it('لا تسجيل بلا مصادقة', async () => {
    const res = await api
      .post('/api/devices')
      .send({ token: FCM_A, platform: 'android' });
    expect(res.status).toBe(401);
  });

  it('يسجّل جهازاً ويقرؤه صاحبه', async () => {
    const res = await api
      .post('/api/devices')
      .set(auth(alice.token))
      .send({ token: FCM_A, platform: 'android' })
      .expect(200);
    expect(res.body.data.registered).toBe(true);

    const mine = await api.get('/api/devices').set(auth(alice.token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].platform).toBe('android');
  });

  it('[CRITICAL] الرمز نفسه لا يُعاد في الاستجابة', async () => {
    // إعادتُه لا فائدة منها للعميل (هو من أرسله)، وتضعه في كل سجلّ يلتقط
    // الاستجابات — تسريبٌ بلا مقابل.
    const mine = await api.get('/api/devices').set(auth(alice.token)).expect(200);
    expect(JSON.stringify(mine.body)).not.toContain(FCM_A);
  });

  it('التسجيل مكرَّرٌ آمن — لا صفّ ثانٍ للجهاز نفسه', async () => {
    await api
      .post('/api/devices')
      .set(auth(alice.token))
      .send({ token: FCM_A, platform: 'android' })
      .expect(200);

    const mine = await api.get('/api/devices').set(auth(alice.token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
  });

  it('[CRITICAL] رمزٌ أُعيد تدويره ينتقل لصاحبه الجديد ولا يبقى للقديم', async () => {
    // المزوّدون يعيدون استعمال الرموز بين الأجهزة. لو بقي الصفّ القديم
    // نشطاً لوصلت إشعارات «أليس» إلى جهاز «بوب» — تسريبٌ صامت.
    await api
      .post('/api/devices')
      .set(auth(bob.token))
      .send({ token: FCM_A, platform: 'ios' })
      .expect(200);

    const aliceDevices = await api.get('/api/devices').set(auth(alice.token)).expect(200);
    const bobDevices = await api.get('/api/devices').set(auth(bob.token)).expect(200);

    expect(aliceDevices.body.data).toHaveLength(0);
    expect(bobDevices.body.data).toHaveLength(1);
    expect(bobDevices.body.data[0].platform).toBe('ios');
  });

  it('أكثر من جهاز للمستخدم الواحد مدعوم', async () => {
    await api
      .post('/api/devices')
      .set(auth(bob.token))
      .send({ token: FCM_B, platform: 'android' })
      .expect(200);
    const mine = await api.get('/api/devices').set(auth(bob.token)).expect(200);
    expect(mine.body.data).toHaveLength(2);
  });

  it('[CRITICAL] لا يستطيع مستخدم إلغاء رمز غيره', async () => {
    const res = await api
      .post('/api/devices/unregister')
      .set(auth(alice.token))
      .send({ token: FCM_B })
      .expect(200);
    // لا يُلغى شيء — الرمز ليس رمزه.
    expect(res.body.data.unregistered).toBe(false);

    const bobDevices = await api.get('/api/devices').set(auth(bob.token)).expect(200);
    expect(bobDevices.body.data).toHaveLength(2);
  });

  it('صاحب الرمز يلغيه (تسجيل الخروج)', async () => {
    const res = await api
      .post('/api/devices/unregister')
      .set(auth(bob.token))
      .send({ token: FCM_B })
      .expect(200);
    expect(res.body.data.unregistered).toBe(true);

    const mine = await api.get('/api/devices').set(auth(bob.token)).expect(200);
    expect(mine.body.data).toHaveLength(1);
  });

  it('يرفض المنصّة المجهولة والرمز القصير', async () => {
    for (const body of [
      { token: FCM_A, platform: 'symbian' },
      { token: 'short', platform: 'android' },
      { platform: 'android' },
      { token: FCM_A },
    ]) {
      const res = await api.post('/api/devices').set(auth(alice.token)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('الرموز الميتة تُعطَّل ولا تُحذف — يبقى أثر الجهاز', async () => {
    await deviceTokenRepo.register(db, {
      userId: alice.userId,
      token: FCM_A,
      platform: 'android',
    });
    const deactivated = await deviceTokenRepo.deactivateTokens(db, [FCM_A]);
    expect(deactivated).toBe(1);

    const active = await deviceTokenRepo.activeTokensFor(db, [alice.userId]);
    expect(active).not.toContain(FCM_A);

    const { rows } = await db.query('SELECT is_active FROM device_tokens WHERE token = $1', [FCM_A]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(false);
  });
});

/**
 * الإرسال من لوحة التحكم — الصلاحية وسلامة السجلّ داخل التطبيق.
 */
describe('بثّ الإشعارات مع الدفع', () => {
  let adminToken: string;
  let customer: { token: string; userId: string };

  beforeAll(async () => {
    adminToken = await createAdminUser();
    customer = await registerAndLogin();
  });

  afterAll(async () => {
    await db.query('DELETE FROM device_tokens WHERE token LIKE $1', ['push-cast-%']);
    await purgeTestUsers();
  });

  it('[CRITICAL] غير المسؤول لا يبثّ إشعارات', async () => {
    const res = await api
      .post('/api/admin/notifications/broadcast')
      .set({ Authorization: `Bearer ${customer.token}` })
      .send({ audience: 'all', title: 'محاولة', body: '' });
    expect(res.status).toBe(403);
  });

  it('البثّ يكتب سجلّ التطبيق ويعيد حالة الدفع', async () => {
    await api
      .post('/api/devices')
      .set({ Authorization: `Bearer ${customer.token}` })
      .send({ token: 'push-cast-'.padEnd(60, 'c'), platform: 'android' })
      .expect(200);

    const res = await api
      .post('/api/admin/notifications/broadcast')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ audience: 'all', title: 'عرض الأسبوع', body: 'خصومات' })
      .expect(201);

    // السجلّ داخل التطبيق هو الضمانة — يُكتب سواء نجح الدفع أم لا.
    expect(res.body.data.recipients).toBeGreaterThan(0);
    expect(res.body.data.push.provider).toBe('noop');
    expect(res.body.data.push.queued).toBe(res.body.data.recipients);

    // ووصل الزبون فعلاً داخل التطبيق.
    const mine = await api
      .get('/api/notifications')
      .set({ Authorization: `Bearer ${customer.token}` })
      .expect(200);
    expect(
      (mine.body.data.items as Array<{ title: string }>).some(
        (n) => n.title === 'عرض الأسبوع',
      ),
    ).toBe(true);
  });
});
