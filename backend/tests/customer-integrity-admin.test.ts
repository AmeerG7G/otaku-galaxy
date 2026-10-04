import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
  simulateLegacyNullGender,
} from './helpers.js';

/**
 * سلامة حساب الزبون من اللوحة (D5 + D2).
 *
 * [CRITICAL] الجنس إلزامي ولا حالة ثالثة: حسابٌ بلا جنس (شذوذ ما قبل ٠٤٠) لا
 * يُفعَّل، ويُكمَل مرةً واحدة بعد تحقّق واتساب — ولا يُغيَّر جنسٌ اختاره صاحبه.
 * وتعليم الحساب داخلياً للمسؤول الأعلى وحده، بسببٍ مسجَّل، ويعيد حساب الأشهر
 * المفتوحة.
 */

let adminToken: string;
let customersOnly: { token: string };
let accountRequestsOnly: { token: string };

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const freshPhone = () => `077${Math.floor(10000000 + Math.random() * 89999999)}`;

async function auditRows(action: string, targetId: string) {
  const { rows } = await db.query<{ details: Record<string, unknown> }>(
    'SELECT details FROM admin_audit_log WHERE action = $1 AND target_id = $2',
    [action, targetId],
  );
  return rows;
}

beforeAll(async () => {
  adminToken = await createAdminUser();
  customersOnly = await createSubAdmin(['customers'], { suffix: 71 });
  accountRequestsOnly = await createSubAdmin(['account_requests'], { suffix: 72 });
});

afterAll(async () => {
  await purgeTestUsers();
  await purgeSubAdmins();
});

describe('قبول تسجيلٍ بلا جنس', () => {
  it('[CRITICAL] يُرفض بـ409 GENDER_REQUIRED ويبقى الحساب غير مفعَّل، ثم يُقبل بعد الإكمال', async () => {
    const registered = await api
      .post('/api/auth/register')
      .send({ username: 'قديم', phone: freshPhone(), password: 'secret123', gender: 'female' })
      .expect(202);
    const requestId = registered.body.data.request.id as string;
    const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM account_requests WHERE id = $1', [requestId]);
    const userId = rows[0]!.user_id;
    await simulateLegacyNullGender(userId);

    const refused = await api
      .post(`/api/admin/account-requests/${requestId}/approve`)
      .set(bearer(adminToken))
      .expect(409);
    expect(refused.body.error.code).toBe('GENDER_REQUIRED');
    const still = await db.query<{ phone_verified_at: Date | null; status: string }>(
      `SELECT u.phone_verified_at, r.status FROM users u JOIN account_requests r ON r.user_id = u.id WHERE r.id = $1`,
      [requestId],
    );
    expect(still.rows[0]).toEqual({ phone_verified_at: null, status: 'pending' });

    await api
      .patch(`/api/admin/customers/${userId}/gender`)
      .set(bearer(customersOnly.token))
      .send({ gender: 'female' })
      .expect(200);
    await api.post(`/api/admin/account-requests/${requestId}/approve`).set(bearer(adminToken)).expect(200);
  });
});

describe('إكمال جنس حسابٍ قديم', () => {
  it('[CRITICAL] يُكمَل مرةً واحدة ويُسجَّل — ولا يُغيَّر جنسٌ مضبوط', async () => {
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);

    const done = await api
      .patch(`/api/admin/customers/${legacy.userId}/gender`)
      .set(bearer(customersOnly.token))
      .send({ gender: 'male' })
      .expect(200);
    expect(done.body.data).toEqual({ id: legacy.userId, gender: 'male' });
    const audit = await auditRows('customer.gender_completed', legacy.userId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.details).toEqual({ gender: 'male' });

    const again = await api
      .patch(`/api/admin/customers/${legacy.userId}/gender`)
      .set(bearer(customersOnly.token))
      .send({ gender: 'female' })
      .expect(409);
    expect(again.body.error.code).toBe('GENDER_ALREADY_SET');
    const { rows } = await db.query<{ gender: string }>('SELECT gender FROM users WHERE id = $1', [legacy.userId]);
    expect(rows[0]!.gender).toBe('male');
  });

  it('[CRITICAL] لا قيمة ثالثة ولا حقلٌ مجهول', async () => {
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);
    for (const body of [{ gender: 'unknown' }, { gender: null }, {}, { gender: 'male', note: 'x' }]) {
      await api.patch(`/api/admin/customers/${legacy.userId}/gender`).set(bearer(adminToken)).send(body).expect(400);
    }
    const { rows } = await db.query<{ gender: string | null }>('SELECT gender FROM users WHERE id = $1', [legacy.userId]);
    expect(rows[0]!.gender).toBeNull();
  });

  it('[SECURITY] حساب المسؤول ليس زبوناً (٤٠٤)، ومن لا يملك قسم الزبائن يُرفض (٤٠٣)', async () => {
    const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    await api
      .patch(`/api/admin/customers/${rows[0]!.id}/gender`)
      .set(bearer(adminToken))
      .send({ gender: 'male' })
      .expect(404);
    const legacy = await registerAndLogin();
    await simulateLegacyNullGender(legacy.userId);
    await api
      .patch(`/api/admin/customers/${legacy.userId}/gender`)
      .set(bearer(accountRequestsOnly.token))
      .send({ gender: 'male' })
      .expect(403);
  });
});

describe('تعليم الحساب داخلياً (D2)', () => {
  it('[SECURITY] للمسؤول الأعلى وحده، ولحساب زبون فقط', async () => {
    const customer = await registerAndLogin();
    await api
      .patch(`/api/admin/customers/${customer.userId}/internal`)
      .set(bearer(customersOnly.token))
      .send({ isInternal: true, reason: 'حساب اختبار' })
      .expect(403);
    const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    await api
      .patch(`/api/admin/customers/${rows[0]!.id}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true, reason: 'حساب اختبار' })
      .expect(404);
  });

  it('[CRITICAL] يُضبط بسببٍ مسجَّل، ويعلّم الأشهر المفتوحة للإعادة، وتكراره لا يكتب سجلّاً', async () => {
    const customer = await registerAndLogin();
    // الشهر الجاري مفتوحٌ دائماً — يُعلَّم «نظيفاً» ثم يُتوقَّع أن يتّسخ.
    await db.query(
      `INSERT INTO analytics_periods (month)
       VALUES (date_trunc('month', (now() AT TIME ZONE 'Asia/Baghdad'))::DATE)
       ON CONFLICT (month) DO NOTHING`,
    );
    await db.query("UPDATE analytics_periods SET dirty = FALSE WHERE status = 'open'");

    await api
      .patch(`/api/admin/customers/${customer.userId}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true })
      .expect(400);
    const set = await api
      .patch(`/api/admin/customers/${customer.userId}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true, reason: 'حساب اختبار المالك' })
      .expect(200);
    expect(set.body.data).toEqual({ id: customer.userId, isInternalAccount: true, changed: true });

    const periods = await db.query<{ dirty: boolean }>("SELECT dirty FROM analytics_periods WHERE status = 'open'");
    expect(periods.rows.every((p) => p.dirty)).toBe(true);
    const audit = await auditRows('customer.internal_account_set', customer.userId);
    expect(audit.map((r) => r.details)).toEqual([{ isInternal: true, reason: 'حساب اختبار المالك' }]);

    const repeat = await api
      .patch(`/api/admin/customers/${customer.userId}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true, reason: 'مرة ثانية' })
      .expect(200);
    expect(repeat.body.data.changed).toBe(false);
    expect(await auditRows('customer.internal_account_set', customer.userId)).toHaveLength(1);

    const detail = await api.get(`/api/admin/customers/${customer.userId}`).set(bearer(adminToken)).expect(200);
    expect(detail.body.data.profile.isInternalAccount).toBe(true);
  });
});
