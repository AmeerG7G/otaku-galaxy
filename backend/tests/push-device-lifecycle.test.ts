import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchPushOutbox } from '../src/jobs/pushOutboxJob.js';
import { pushOutboxRepo } from '../src/repositories/pushOutboxRepo.js';
import type { PushProvider } from '../src/services/push/index.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * دورة حياة أجهزة الزبون.
 *
 * [SECURITY] رفعُ نسخة التوكن (إيقاف، كلمة مرورٍ من المسؤول، تغيير الزبون كلمة
 * مروره) يُسقط أجهزته في الجملة نفسها؛ حسابٌ موقوف لا يُرسَل إليه ولو بقي له رمز؛
 * والرمز الصامت ستين يوماً يُعطَّل.
 */

let adminToken: string;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let seq = 0;

async function withDevice() {
  const customer = await registerAndLogin();
  seq += 1;
  const token = `lifecycle-device-${seq}-${Date.now()}`;
  await api.post('/api/devices').set(bearer(customer.token)).send({ token, platform: 'android' }).expect(200);
  return { ...customer, deviceToken: token };
}

async function deviceActive(token: string) {
  const { rows } = await db.query<{ is_active: boolean }>('SELECT is_active FROM device_tokens WHERE token = $1', [token]);
  return rows[0]!.is_active;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('رفع نسخة التوكن يُسقط الأجهزة', () => {
  it('[CRITICAL] الإيقاف يعطّل أجهزة الزبون، وإعادة التفعيل لا تحييها', async () => {
    const customer = await withDevice();
    await api.patch(`/api/admin/users/${customer.userId}/active`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
    expect(await deviceActive(customer.deviceToken)).toBe(false);
    await api.patch(`/api/admin/users/${customer.userId}/active`).set(bearer(adminToken)).send({ isActive: true }).expect(200);
    expect(await deviceActive(customer.deviceToken)).toBe(false);
  });

  it('[CRITICAL] كلمة مرورٍ يضعها المسؤول تعطّل الأجهزة', async () => {
    const customer = await withDevice();
    await api
      .patch(`/api/admin/customers/${customer.userId}/password`)
      .set(bearer(adminToken))
      .send({ newPassword: 'new-password-123' })
      .expect(200);
    expect(await deviceActive(customer.deviceToken)).toBe(false);
  });

  it('تغيير الزبون كلمة مروره يعطّلها، وإعادة التسجيل بالتوكن الجديد تعيد هذا الجهاز وحده', async () => {
    const customer = await withDevice();
    const changed = await api
      .patch('/api/auth/me/password')
      .set(bearer(customer.token))
      .send({ currentPassword: customer.password, newPassword: 'another-pass-123' })
      .expect(200);
    expect(await deviceActive(customer.deviceToken)).toBe(false);
    await api
      .post('/api/devices')
      .set(bearer(changed.body.data.token))
      .send({ token: customer.deviceToken, platform: 'android' })
      .expect(200);
    expect(await deviceActive(customer.deviceToken)).toBe(true);
  });
});

describe('الإرسال لحسابٍ فعّال فقط', () => {
  it('[CRITICAL] حسابٌ موقوف لا يُرسَل إليه ولو بقي رمزه نشطاً', async () => {
    const customer = await withDevice();
    // إيقافٌ مباشر في القاعدة يترك الرمز نشطاً — الحاجز الثاني يمنعه.
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [customer.userId]);
    expect(await pushOutboxRepo.customerTokens(db, customer.userId)).toEqual([]);
    const sent: string[][] = [];
    const provider: PushProvider = {
      name: 'record',
      async send(message) {
        sent.push(message.tokens);
        return { sent: message.tokens.length, invalidTokens: [] };
      },
    };
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO notifications (user_id, type, title) VALUES ($1, 'orderAccepted', 'موقوف') RETURNING id",
      [customer.userId],
    );
    await dispatchPushOutbox({ provider, batchSize: 100_000 });
    expect(sent.flat()).not.toContain(customer.deviceToken);
    const outbox = await db.query<{ status: string; last_error: string }>(
      'SELECT status, last_error FROM push_outbox WHERE notification_id = $1',
      [rows[0]!.id],
    );
    expect(outbox.rows[0]).toEqual({ status: 'skipped', last_error: 'no_devices' });
  });
});

describe('الرموز الصامتة', () => {
  it('رمزٌ لم يُؤكَّد ستين يوماً يُعطَّل، والحديث يبقى', async () => {
    const stale = await withDevice();
    const fresh = await withDevice();
    await db.query("UPDATE device_tokens SET last_seen_at = now() - interval '61 days' WHERE token = $1", [stale.deviceToken]);
    await pushOutboxRepo.deactivateStaleCustomerTokens(db, 60);
    expect(await deviceActive(stale.deviceToken)).toBe(false);
    expect(await deviceActive(fresh.deviceToken)).toBe(true);
  });
});
