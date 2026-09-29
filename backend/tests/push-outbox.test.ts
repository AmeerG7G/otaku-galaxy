import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchPushOutbox, MAX_PUSH_ATTEMPTS } from '../src/jobs/pushOutboxJob.js';
import {
  FCM_SCOPE,
  FcmPushProvider,
  GOOGLE_TOKEN_URL,
  PushDeliveryError,
  type PushMessage,
  type PushProvider,
} from '../src/services/push/index.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * الدفع عبر الصندوق الصادر (STEP 64، هجرة ٠٧٠).
 *
 * لا شبكة هنا: المزوّد مزدوجٌ يسجّل ما طُلب منه، وFCM يُختبر بـ`fetch`
 * مستبدَل ومفتاح RSA حقيقيّ مولَّد للاختبار — فيُتحقَّق من التوقيع نفسه، لا
 * من أن «شيئاً ما» أُرسل. هذا ليس إيصالاً حقيقياً إلى هاتف (يحتاج مشروع
 * Firebase)، وهو مسمّى كذلك في التقرير.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** مزوّدٌ مزدوج: يسجّل كل رسالة، وسلوكه قابلٌ للضبط لكل حالة. */
function recordingProvider(
  behave: (message: PushMessage) => { sent?: number; invalid?: string[]; transient?: number } = ({ tokens }) => ({
    sent: tokens.length,
  }),
) {
  const calls: PushMessage[] = [];
  const provider: PushProvider = {
    name: 'recording',
    async send(message) {
      calls.push(message);
      const r = behave(message);
      return { sent: r.sent ?? 0, invalidTokens: r.invalid ?? [], transientFailures: r.transient ?? 0 };
    },
  };
  return { provider, calls };
}

/** دورةٌ تلتقط كل المستحقّ (صفوف السويتات الأخرى تسبق بترتيب الوصول). */
const dispatch = (provider: PushProvider | null) => dispatchPushOutbox({ provider, batchSize: 100_000 });

async function outboxFor(userId: string, audience: 'customer' | 'admin' = 'customer') {
  const { rows } = await db.query<{
    id: string;
    status: string;
    attempts: number;
    last_error: string | null;
    event_key: string | null;
    data: Record<string, string>;
    next_attempt_at: Date;
  }>(
    `SELECT id::text, status, attempts, last_error, event_key, data, next_attempt_at
       FROM push_outbox WHERE user_id = $1 AND audience = $2 ORDER BY id`,
    [userId, audience],
  );
  return rows;
}

async function registerDevice(token: string, deviceToken: string) {
  await api.post('/api/devices').set(bearer(token)).send({ token: deviceToken, platform: 'android' }).expect(200);
}

let seq = 0;
const deviceToken = (label: string) => `test-device-${label}-${Date.now()}-${seq++}`.padEnd(40, 'x');

describe('push outbox — every in-app notification is queued in its own transaction', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeTestUsers();
  });

  it('the trigger enqueues one customer row per notification, whatever inserted it', async () => {
    const customer = await registerAndLogin();
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body) VALUES ($1, 'promotion', 'مباشر', 'نص')`,
      [customer.userId],
    );
    await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .send({ userId: customer.userId, title: 'يدوي', body: '' })
      .expect(201);
    await api
      .post('/api/admin/notifications/broadcast')
      .set(bearer(adminToken))
      .send({ audience: 'users', userIds: [customer.userId], title: 'بثّ', body: '' })
      .expect(201);
    const rows = await outboxFor(customer.userId);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('pending');
      expect(row.data.type).toBe('promotion');
      expect(row.data.notificationId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('a rolled-back notification leaves no outbox row (same transaction)', async () => {
    const customer = await registerAndLogin();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'يتراجع')`,
        [customer.userId],
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await outboxFor(customer.userId)).toEqual([]);
  });
});

describe('push outbox — delivery outcomes', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await purgeTestUsers();
  });

  async function customerWithNotification(options: { device?: boolean; offers?: boolean } = {}) {
    const customer = await registerAndLogin();
    const token = deviceToken('c');
    if (options.device !== false) await registerDevice(customer.token, token);
    if (options.offers) {
      await api.patch('/api/notifications/prefs').set(bearer(customer.token)).send({ key: 'offers', enabled: true }).expect(200);
    }
    await api
      .post('/api/admin/notifications')
      .set(bearer(adminToken))
      .send({ userId: customer.userId, title: 'عرض', body: 'نص' })
      .expect(201);
    return { ...customer, deviceToken: token };
  }

  it('sends to the customer device tokens only, as a notification (not data-only) with routing data', async () => {
    const c = await customerWithNotification({ offers: true });
    const { provider, calls } = recordingProvider();
    await dispatch(provider);
    const mine = calls.filter((m) => m.tokens.includes(c.deviceToken));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'عرض', body: 'نص', dataOnly: false, tokens: [c.deviceToken] });
    expect(mine[0]!.data).toMatchObject({ type: 'promotion' });
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('[PREFS] honoured at send time: offers off (the default) ⇒ skipped pref_disabled, provider not called for it', async () => {
    const c = await customerWithNotification({ offers: false });
    const { provider, calls } = recordingProvider();
    await dispatch(provider);
    expect(calls.some((m) => m.tokens.includes(c.deviceToken))).toBe(false);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'skipped', last_error: 'pref_disabled' });
  });

  it('[PREFS] a preference switched off after queueing still wins (read at send, not at insert)', async () => {
    const c = await customerWithNotification({ offers: true });
    await api.patch('/api/notifications/prefs').set(bearer(c.token)).send({ key: 'offers', enabled: false }).expect(200);
    await dispatch(recordingProvider().provider);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'skipped', last_error: 'pref_disabled' });
  });

  it('no device ⇒ skipped no_devices', async () => {
    const c = await customerWithNotification({ device: false, offers: true });
    await dispatch(recordingProvider().provider);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'skipped', last_error: 'no_devices' });
  });

  it('[NOT CONFIGURED] no provider ⇒ skipped push_not_configured (never a fake success)', async () => {
    const c = await customerWithNotification({ offers: true });
    const summary = await dispatch(null);
    expect(summary.skipped).toBeGreaterThan(0);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'skipped', last_error: 'push_not_configured' });
  });

  it('[STALE TOKENS] tokens the provider rejects are deactivated; all rejected ⇒ failed', async () => {
    const c = await customerWithNotification({ offers: true });
    const { provider } = recordingProvider(({ tokens }) => ({ invalid: tokens }));
    await dispatch(provider);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'failed', last_error: 'all_tokens_invalid' });
    const device = await db.query<{ is_active: boolean }>('SELECT is_active FROM device_tokens WHERE token = $1', [c.deviceToken]);
    expect(device.rows[0]!.is_active).toBe(false);
  });

  it('[RETRY] a transient failure backs off (30s, 2min…) and fails after the last attempt', async () => {
    const c = await customerWithNotification({ offers: true });
    const { provider } = recordingProvider(({ tokens }) => ({ transient: tokens.length }));
    for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
      await dispatch(provider);
      const [row] = await outboxFor(c.userId);
      if (attempt < MAX_PUSH_ATTEMPTS) {
        expect(row).toMatchObject({ status: 'pending', attempts: attempt });
        const waitSeconds = (row!.next_attempt_at.getTime() - Date.now()) / 1000;
        expect(waitSeconds).toBeGreaterThan(attempt === 1 ? 20 : 100);
        await db.query('UPDATE push_outbox SET next_attempt_at = now() WHERE id = $1', [row!.id]);
      } else {
        expect(row).toMatchObject({ status: 'failed', attempts: MAX_PUSH_ATTEMPTS });
      }
    }
  });

  it('[RETRY] a provider exception is retried, not lost; the claim lease hides the row until due', async () => {
    const c = await customerWithNotification({ offers: true });
    await dispatch({ name: 'down', send: async () => { throw new PushDeliveryError('injected: token exchange'); } });
    const [row] = await outboxFor(c.userId);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, last_error: 'injected: token exchange' });
    // ليس مستحقاً بعد ⇒ دورةٌ فورية لا تلمسه.
    const { provider, calls } = recordingProvider();
    await dispatch(provider);
    expect(calls.some((m) => m.tokens.includes(c.deviceToken))).toBe(false);
  });

  it('a partial success is sent (never re-sent to the devices it reached)', async () => {
    const c = await customerWithNotification({ offers: true });
    const second = deviceToken('c2');
    await registerDevice(c.token, second);
    const { provider } = recordingProvider(() => ({ sent: 1, transient: 1 }));
    await dispatch(provider);
    expect((await outboxFor(c.userId))[0]).toMatchObject({ status: 'sent', last_error: 'partial:1' });
  });
});

describe('admin push — events, fan-out, and separation from customers', () => {
  let superToken: string;
  let superId: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  const superDevice = deviceToken('super');

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    superToken = await createAdminUser();
    superId = (await api.get('/api/admin/me').set(bearer(superToken))).body.data.id;
    await api.post('/api/admin/devices').set(bearer(superToken)).send({ token: superDevice, platform: 'web' }).expect(200);
  });

  afterAll(async () => {
    await db.query('DELETE FROM admin_push_devices WHERE token = $1', [superDevice]);
    await db.query('DELETE FROM admin_notification_prefs WHERE user_id = $1', [superId]);
    await purgeSubAdmins();
    await purgeTestUsers();
  });

  async function placeOrder() {
    const customer = await registerAndLogin();
    await api.post('/api/cart').set(bearer(customer.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(customer.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، المنصور', phone: '07744444444' })
      .expect(201);
    return { customer, orderId: order.body.data.id as string };
  }

  it('a new order notifies the super admin and sub-admins holding «orders» with a device — nobody else', async () => {
    const withOrders = await createSubAdmin(['orders'], { suffix: 41 });
    const withoutSection = await createSubAdmin(['reviews'], { suffix: 42 });
    const noDevice = await createSubAdmin(['orders'], { suffix: 43 });
    const disabled = await createSubAdmin(['orders'], { suffix: 44 });
    for (const [admin, label] of [[withOrders, 'o'], [withoutSection, 'r'], [disabled, 'd']] as const) {
      await api.post('/api/admin/devices').set(bearer(admin.token)).send({ token: deviceToken(`admin-${label}`), platform: 'web' }).expect(200);
    }
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [disabled.userId]);

    const { customer, orderId } = await placeOrder();

    const eventFor = async (userId: string) =>
      (await outboxFor(userId, 'admin')).filter((row) => row.data.orderId === orderId);
    expect(await eventFor(superId)).toHaveLength(1);
    expect(await eventFor(withOrders.userId)).toHaveLength(1);
    expect(await eventFor(withoutSection.userId)).toHaveLength(0);
    expect(await eventFor(noDevice.userId)).toHaveLength(0);
    expect(await eventFor(disabled.userId)).toHaveLength(0);
    // والزبون لا يصله حدثٌ إداري بأي صورة.
    expect(await outboxFor(customer.userId, 'admin')).toEqual([]);

    const [row] = await eventFor(superId);
    expect(row).toMatchObject({ event_key: 'new_order', status: 'pending' });
    expect(row!.data).toMatchObject({ event: 'new_order', url: `/orders/${orderId}`, orderId });
  });

  it('[SEPARATION] admin events go to admin_push_devices as data-only web pushes — never to device_tokens', async () => {
    const { orderId } = await placeOrder();
    // المسؤول نفسه مسجَّلٌ أيضاً كجهاز «زبون» (عبر /api/devices) — لا يصله الحدث هناك.
    const customerSideToken = deviceToken('super-as-customer');
    await registerDevice(superToken, customerSideToken);

    const { provider, calls } = recordingProvider();
    await dispatch(provider);
    const adminCalls = calls.filter((m) => m.data?.orderId === orderId && m.data?.event === 'new_order');
    expect(adminCalls.length).toBeGreaterThan(0);
    for (const call of adminCalls) {
      expect(call.dataOnly).toBe(true);
      expect(call.tokens).not.toContain(customerSideToken);
    }
    expect(adminCalls.some((m) => m.tokens.includes(superDevice))).toBe(true);
    await db.query('DELETE FROM device_tokens WHERE token = $1', [customerSideToken]);
  });

  it('[SEPARATION] a token becomes an admin device exclusively; a customer cannot register an active admin device token', async () => {
    const customer = await registerAndLogin();
    const shared = deviceToken('shared');
    await registerDevice(customer.token, shared);
    await api.post('/api/admin/devices').set(bearer(superToken)).send({ token: shared, platform: 'web' }).expect(200);
    expect((await db.query('SELECT 1 FROM device_tokens WHERE token = $1', [shared])).rowCount).toBe(0);

    const steal = await api.post('/api/devices').set(bearer(customer.token)).send({ token: shared, platform: 'android' });
    expect(steal.status).toBe(409);
    expect(steal.body.error.code).toBe('DEVICE_TOKEN_TAKEN');
    const owner = await db.query<{ user_id: string; is_active: boolean }>('SELECT user_id, is_active FROM admin_push_devices WHERE token = $1', [shared]);
    expect(owner.rows[0]).toEqual({ user_id: superId, is_active: true });
    await db.query('DELETE FROM admin_push_devices WHERE token = $1', [shared]);
  });

  it('an admin can only unregister their own device; prefs are per admin and gate events', async () => {
    const sub = await createSubAdmin(['orders', 'account_requests'], { suffix: 45 });
    const subDevice = deviceToken('sub45');
    await api.post('/api/admin/devices').set(bearer(sub.token)).send({ token: subDevice, platform: 'web' }).expect(200);

    // لا يعطّل جهاز المسؤول الأعلى.
    const foreign = await api.post('/api/admin/devices/unregister').set(bearer(sub.token)).send({ token: superDevice });
    expect(foreign.body.data.unregistered).toBe(false);
    expect((await db.query('SELECT is_active FROM admin_push_devices WHERE token = $1', [superDevice])).rows[0]).toEqual({ is_active: true });

    const prefs = await api.get('/api/admin/notification-prefs').set(bearer(sub.token)).expect(200);
    expect(prefs.body.data.prefs).toEqual({ new_order: true, account_request: true, restock_request: true });
    await api.patch('/api/admin/notification-prefs').set(bearer(sub.token)).send({ key: 'new_order', enabled: false }).expect(200);

    const { orderId } = await placeOrder();
    expect((await outboxFor(sub.userId, 'admin')).filter((row) => row.data.orderId === orderId)).toEqual([]);
    expect((await outboxFor(superId, 'admin')).filter((row) => row.data.orderId === orderId)).toHaveLength(1);

    const unknown = await api.patch('/api/admin/notification-prefs').set(bearer(sub.token)).send({ key: 'everything', enabled: true });
    expect(unknown.status).toBe(400);
  });

  it('a NEW account request notifies once; resuming the same pending request does not ring again', async () => {
    const phone = `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const body = { username: 'طالب حساب', phone, password: 'password-123', gender: 'female' };
    await api.post('/api/auth/register').send(body).expect(202);
    await api.post('/api/auth/register').send({ ...body, username: 'طالب حساب ٢' }).expect(202);
    const rows = (await outboxFor(superId, 'admin')).filter(
      (row) => row.event_key === 'account_request' && row.data.url === '/account-requests',
    );
    const mine = [];
    for (const row of rows) {
      const { rows: r } = await db.query('SELECT 1 FROM account_requests WHERE id = $1 AND submitted_phone LIKE $2', [
        row.data.requestId,
        `%${phone.slice(1)}`,
      ]);
      if (r.length) mine.push(row);
    }
    expect(mine).toHaveLength(1);
  });

  it('a password-reset request notifies the admins holding «account_requests»', async () => {
    const customer = await registerAndLogin();
    const before = (await outboxFor(superId, 'admin')).length;
    await api
      .post('/api/auth/forgot-password')
      .send({ phone: customer.phone, username: 'مختبر', gender: 'male', levelKey: 'explorer' })
      .expect(202);
    const after = await outboxFor(superId, 'admin');
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({ event_key: 'account_request' });
  });

  it('a NEW restock subscription notifies «restock» admins; a repeated tap does not', async () => {
    const customer = await registerAndLogin();
    const productId = catalog.productIds[2]!;
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);
    try {
      const before = (await outboxFor(superId, 'admin')).filter((r) => r.data.productId === productId).length;
      const subscribe = () =>
        api.post('/api/restock-subscriptions').set(bearer(customer.token)).send({ productId });
      expect([200, 201]).toContain((await subscribe()).status);
      expect([200, 201]).toContain((await subscribe()).status);
      const after = (await outboxFor(superId, 'admin')).filter((r) => r.data.productId === productId).length;
      expect(after - before).toBe(1);
    } finally {
      await db.query('DELETE FROM restock_subscriptions WHERE product_id = $1', [productId]);
      await db.query('UPDATE products SET stock = 10 WHERE id = $1', [productId]);
    }
  });

  it('GET /admin/push/status reports configuration and this admin device count', async () => {
    const res = await api.get('/api/admin/push/status').set(bearer(superToken)).expect(200);
    expect(res.body.data).toMatchObject({ configured: true, provider: 'noop' });
    expect(res.body.data.devices).toBeGreaterThanOrEqual(1);
  });
});

describe('FCM HTTP v1 provider — token exchange and error classification (stubbed fetch, real RSA key)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const settings = { projectId: 'otaku-test', clientEmail: 'push@otaku-test.iam.gserviceaccount.com', privateKey, timeoutMs: 500 };

  type Reply = { status: number; body?: unknown } | Error;
  function stubFetch(replies: { token?: Reply[]; send?: Reply[] }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const tokenReplies = [...(replies.token ?? [])];
    const sendReplies = [...(replies.send ?? [])];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const reply = (url === GOOGLE_TOKEN_URL ? tokenReplies : sendReplies).shift() ?? { status: 200, body: {} };
      if (reply instanceof Error) throw reply;
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
    });
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('signs an RS256 service-account assertion with the right claims and exchanges it for an access token', async () => {
    const calls = stubFetch({ token: [{ status: 200, body: { access_token: 'ya29.test', expires_in: 3600 } }] });
    const provider = new FcmPushProvider(settings);
    expect(await provider.obtainAccessToken()).toBe('ya29.test');

    const exchange = calls[0]!;
    expect(exchange.url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(String(exchange.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const claims = jwt.verify(form.get('assertion')!, publicKey, { algorithms: ['RS256'] }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ iss: settings.clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL });
    expect(claims.exp! - claims.iat!).toBe(3600);
  });

  it('caches the access token until a minute before expiry, then refreshes', async () => {
    let now = 1_800_000_000_000;
    const calls = stubFetch({
      token: [
        { status: 200, body: { access_token: 'first', expires_in: 3600 } },
        { status: 200, body: { access_token: 'second', expires_in: 3600 } },
      ],
    });
    const provider = new FcmPushProvider(settings, () => now);
    expect(await provider.obtainAccessToken()).toBe('first');
    now += 3_500_000; // 58 دقيقة و20 ثانية
    expect(await provider.obtainAccessToken()).toBe('first');
    now += 60_000; // يتجاوز حدّ الدقيقة الأخيرة
    expect(await provider.obtainAccessToken()).toBe('second');
    expect(calls.filter((c) => c.url === GOOGLE_TOKEN_URL)).toHaveLength(2);
  });

  it('a rejected exchange or a malformed key is a PushDeliveryError (retryable) — never a fake success', async () => {
    stubFetch({ token: [{ status: 400, body: { error: 'invalid_grant' } }] });
    await expect(new FcmPushProvider(settings).send({ tokens: ['t'], title: 'x', body: 'y' })).rejects.toBeInstanceOf(PushDeliveryError);
    await expect(
      new FcmPushProvider({ ...settings, privateKey: 'not-a-key' }).obtainAccessToken(),
    ).rejects.toBeInstanceOf(PushDeliveryError);
  });

  it('classifies per-token outcomes: 200 sent; 404/UNREGISTERED/invalid token invalid; bad payload, 429, 5xx, network transient', async () => {
    const calls = stubFetch({
      token: [{ status: 200, body: { access_token: 'ya29', expires_in: 3600 } }],
      send: [
        { status: 200, body: { name: 'projects/x/messages/1' } },
        { status: 404, body: { error: { status: 'NOT_FOUND' } } },
        { status: 400, body: { error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'UNREGISTERED' }] } } },
        { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } } },
        { status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } } },
        { status: 429, body: {} },
        { status: 503, body: {} },
        new Error('ECONNRESET'),
      ],
    });
    const tokens = ['ok', 'gone', 'unregistered', 'garbage', 'payload-bug', 'throttled', 'unavailable', 'network'];
    const result = await new FcmPushProvider(settings).send({ tokens, title: 'عنوان', body: 'نص', data: { orderId: '1' } });
    expect(result).toEqual({ sent: 1, invalidTokens: ['gone', 'unregistered', 'garbage'], transientFailures: 4 });

    // حمولة الزبون: إشعار + قناة أندرويد + بيانات التوجيه.
    const first = JSON.parse(String(calls.find((c) => c.url.includes('messages:send'))!.init.body));
    expect(first.message).toMatchObject({
      token: 'ok',
      notification: { title: 'عنوان', body: 'نص' },
      data: { orderId: '1' },
      android: { priority: 'HIGH', notification: { channel_id: 'otaku_default' } },
    });
    expect(calls.find((c) => c.url.includes('messages:send'))!.init.headers).toMatchObject({ Authorization: 'Bearer ya29' });
  });

  it('data-only (admin web) messages carry title/body in data and no notification block', async () => {
    const calls = stubFetch({ token: [{ status: 200, body: { access_token: 'ya29', expires_in: 3600 } }] });
    await new FcmPushProvider(settings).send({ tokens: ['w'], title: 'طلب جديد', body: 'x', data: { url: '/orders/1' }, dataOnly: true });
    const message = JSON.parse(String(calls.find((c) => c.url.includes('messages:send'))!.init.body)).message;
    expect(message.notification).toBeUndefined();
    expect(message.data).toEqual({ url: '/orders/1', title: 'طلب جديد', body: 'x' });
  });

  it('a 401 from FCM drops the cached access token so the next attempt re-exchanges', async () => {
    const calls = stubFetch({
      token: [
        { status: 200, body: { access_token: 'stale', expires_in: 3600 } },
        { status: 200, body: { access_token: 'fresh', expires_in: 3600 } },
      ],
      send: [{ status: 401, body: {} }, { status: 200, body: {} }],
    });
    const provider = new FcmPushProvider(settings);
    expect(await provider.send({ tokens: ['a'], title: 't', body: 'b' })).toMatchObject({ sent: 0, transientFailures: 1 });
    expect(await provider.send({ tokens: ['a'], title: 't', body: 'b' })).toMatchObject({ sent: 1 });
    expect(calls.filter((c) => c.url === GOOGLE_TOKEN_URL)).toHaveLength(2);
  });
});
