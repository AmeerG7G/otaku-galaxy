import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchPushOutbox } from '../src/jobs/pushOutboxJob.js';
import type { PushProvider } from '../src/services/push/index.js';
import { api, createAdminUser, createSubAdmin, purgeSubAdmins, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * حملات الإشعارات — هوية دائمة، عدم تكرار، أعدادٌ لا مستلمون.
 *
 * [CRITICAL] البثّ صفٌّ واحد في `notification_campaigns` تحمله سجلاته كلها؛
 * «مقبولة لدى FCM» ليست «وصلت»؛ والقائمة لا تكشف أسماء المستلمين ولا أرقامهم.
 */

let adminToken: string;
let notificationsOnly: { token: string };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const acceptAll: PushProvider = {
  name: 'accept',
  async send({ tokens }) {
    return { sent: tokens.length, invalidTokens: [] };
  },
};

beforeAll(async () => {
  adminToken = await createAdminUser();
  notificationsOnly = await createSubAdmin(['notifications'], { suffix: 76 });
});

afterAll(async () => {
  await purgeTestUsers();
  await purgeSubAdmins();
});

describe('البثّ حملةٌ واحدة', () => {
  it('[CRITICAL] سجلّات البثّ كلها تحمل الحملة، والحملة تصف جمهورها بلا معرّفات', async () => {
    const a = await registerAndLogin();
    const b = await registerAndLogin();
    const res = await api
      .post('/api/admin/notifications/broadcast')
      .set(bearer(notificationsOnly.token))
      .set('Idempotency-Key', randomUUID())
      .send({ audience: 'users', userIds: [a.userId, b.userId], title: 'عرض الحملة', body: 'نص' })
      .expect(201);
    const campaignId = res.body.data.campaignId as string;
    const { rows } = await db.query<{ campaign_id: string }>(
      "SELECT campaign_id FROM notifications WHERE user_id = ANY($1::uuid[]) AND title = 'عرض الحملة'",
      [[a.userId, b.userId]],
    );
    expect(rows.map((r) => r.campaign_id)).toEqual([campaignId, campaignId]);

    const detail = await api.get(`/api/admin/notifications/campaigns/${campaignId}`).set(bearer(notificationsOnly.token)).expect(200);
    expect(detail.body.data).toMatchObject({
      kind: 'broadcast',
      recipients: 2,
      audience: { type: 'users', userCount: 2, segment: null },
    });
    const serialized = JSON.stringify(detail.body);
    expect(serialized).not.toContain(a.phone);
    expect(serialized).not.toContain(a.userId);

    const audit = await db.query<{ details: Record<string, unknown> }>(
      "SELECT details FROM admin_audit_log WHERE action = 'notification.broadcast' AND target_id = $1",
      [campaignId],
    );
    expect(audit.rows[0]!.details).toMatchObject({ recipients: 2, audienceType: 'users', audienceUserCount: 2 });
    expect(JSON.stringify(audit.rows[0]!.details)).not.toContain(a.userId);
  });

  it('[CRITICAL] الأعداد: «مقبولة لدى FCM» بعد الإرسال، و«قُرئت داخل التطبيق» بعد القراءة — لا «وصلت»', async () => {
    const a = await registerAndLogin();
    await api.post('/api/devices').set(bearer(a.token)).send({ token: `campaign-device-${Date.now()}`, platform: 'android' }).expect(200);
    const res = await api
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ audience: 'users', userIds: [a.userId], title: 'حملة أعداد', body: 'نص' })
      .expect(201);
    const campaignId = res.body.data.campaignId as string;
    const pending = await api.get(`/api/admin/notifications/campaigns/${campaignId}`).set(bearer(adminToken)).expect(200);
    expect(pending.body.data.push).toMatchObject({ pending: 1, acceptedByFcm: 0 });

    // تفعيل التفضيل «العروض» (معطّل افتراضياً) ليصل الدفع.
    await api.patch('/api/notifications/prefs').set(bearer(a.token)).send({ key: 'offers', enabled: true }).expect(200);
    await dispatchPushOutbox({ provider: acceptAll, batchSize: 100_000 });
    const list = await api.get('/api/notifications').set(bearer(a.token)).expect(200);
    const notification = list.body.data.items.find((n: { title: string }) => n.title === 'حملة أعداد');
    await api.post(`/api/notifications/${notification.id}/read`).set(bearer(a.token)).expect(200);

    const after = await api.get(`/api/admin/notifications/campaigns/${campaignId}`).set(bearer(adminToken)).expect(200);
    expect(after.body.data.push).toMatchObject({ pending: 0, acceptedByFcm: 1, devicesAcceptedByFcm: 1 });
    expect(after.body.data.readInApp).toBe(1);
    expect(after.body.data.openedFromPush).toBe(0);
    expect(JSON.stringify(after.body)).not.toMatch(/delivered/i);
  });

  it('القائمة الأحدث أولاً وتُرشَّح بالنوع', async () => {
    const a = await registerAndLogin();
    await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .set('Idempotency-Key', randomUUID())
      .send({ userId: a.userId, title: 'يدوي القائمة', body: 'نص' })
      .expect(201);
    const manual = await api.get('/api/admin/notifications/campaigns').query({ kind: 'manual', limit: 5 }).set(bearer(adminToken)).expect(200);
    expect(manual.body.data.items[0]).toMatchObject({ kind: 'manual', title: 'يدوي القائمة', recipients: 1 });
    expect(manual.body.data.items.every((c: { kind: string }) => c.kind === 'manual')).toBe(true);
  });
});

describe('عدم التكرار', () => {
  it('[CRITICAL] الإشعار اليدوي بالمفتاح نفسه يعيد السجلّ نفسه', async () => {
    const a = await registerAndLogin();
    const key = randomUUID();
    const first = await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .set('Idempotency-Key', key)
      .send({ userId: a.userId, title: 'يدوي مكرر', body: 'نص' })
      .expect(201);
    const again = await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .set('Idempotency-Key', key)
      .send({ userId: a.userId, title: 'يدوي مكرر', body: 'نص' })
      .expect(200);
    expect(again.body.data).toMatchObject({ id: first.body.data.id, replayed: true });
  });

  it('مفتاح بثٍّ يُعاد على إشعارٍ يدوي يُرفض (409) لا يعيد شيئاً آخر', async () => {
    const a = await registerAndLogin();
    const key = randomUUID();
    await api
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .set('Idempotency-Key', key)
      .send({ audience: 'users', userIds: [a.userId], title: 'بث', body: 'نص' })
      .expect(201);
    const reused = await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .set('Idempotency-Key', key)
      .send({ userId: a.userId, title: 'يدوي', body: 'نص' })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('مفتاحٌ ليس UUID يُرفض', async () => {
    const a = await registerAndLogin();
    await api
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .set('Idempotency-Key', 'not-a-uuid')
      .send({ audience: 'users', userIds: [a.userId], title: 'بث', body: 'نص' })
      .expect(400);
  });
});
