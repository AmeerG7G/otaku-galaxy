import type pg from 'pg';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { adminPushRepo } from '../src/repositories/adminPushRepo.js';
import { pushOutboxRepo } from '../src/repositories/pushOutboxRepo.js';
import { api, createSubAdmin } from './helpers.js';

/**
 * تغيير المسؤول كلمة مروره عبر `PATCH /api/auth/me/password` يُسقط أجهزة إشعاره.
 *
 * [SECURITY] المسار مفتوحٌ لكل حساب — والمسؤول الفرعي بلا قسم «المسؤولين» لا يملك
 * غيره (`PATCH /api/admin/me` يطلب ذلك القسم). كان يرفع `token_version` فتسقط
 * الجلسات القديمة، ويُبقي أجهزة إشعارها نشطةً قابلةً للإرسال حتى انتهاء الجلسة
 * (سبعة أيام): متصفّحٌ سجّلته جلسةٌ مسروقة يبقى يستقبل أسماء الزبائن وأرقامهم بعد
 * أن غيّر صاحب الحساب كلمة مروره. الآن كما في `PATCH /api/admin/me`: النسخة
 * والأجهزة في معاملةٍ واحدة — لا لحظة تُرفض فيها الجلسة ويبقى جهازها يستقبل.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let seq = 0;
const deviceToken = (label: string) => `admin-pw-revoke-${label}-${Date.now()}-${seq++}`.padEnd(48, 'x');
const NEW_PASSWORD = 'changed-password-55';

async function isActive(token: string) {
  const { rows } = await db.query<{ is_active: boolean }>(
    'SELECT is_active FROM admin_push_devices WHERE token = $1',
    [token],
  );
  return rows[0]?.is_active;
}

async function registerDevice(session: string, label: string) {
  const token = deviceToken(label);
  await api.post('/api/admin/devices').set(bearer(session)).send({ token, platform: 'web' }).expect(200);
  return token;
}

const changePassword = (admin: { token: string; password: string }) =>
  api
    .patch('/api/auth/me/password')
    .set(bearer(admin.token))
    .send({ currentPassword: admin.password, newPassword: NEW_PASSWORD });

/** فشل الالتزام مرةً واحدة للعميل التالي الذي يطلبه `withTransaction` (نمط تدقيق #4). */
function failNextCommit() {
  const original = db.connect.bind(db) as (cb?: unknown) => Promise<pg.PoolClient>;
  let armed = true;
  return vi.spyOn(db, 'connect').mockImplementation((async (cb?: unknown) => {
    if (typeof cb === 'function') return original(cb);
    const client = await original();
    if (!armed) return client;
    const query = client.query.bind(client);
    (client as { query: unknown }).query = ((...args: unknown[]) => {
      if (armed && args[0] === 'COMMIT') {
        armed = false;
        return Promise.reject(new Error('injected: commit failure'));
      }
      return (query as (...a: unknown[]) => unknown)(...args);
    }) as typeof client.query;
    return client;
  }) as typeof db.connect);
}

describe('[SECURITY] تغيير المسؤول كلمة مروره من مسار الحساب العام يُسقط أجهزة إشعاره', () => {
  const suffixes = [860, 861, 862, 863];
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await db.query('DELETE FROM users WHERE phone = ANY($1::text[])', [
      suffixes.map((n) => `+964780000${String(n).padStart(4, '0')}`),
    ]);
  });

  it('الجلسة القديمة تُرفض، وأجهزتها كلها لم تعد نشطة ولا يُرسَل إليها', async () => {
    // مسؤولٌ فرعي بلا قسم «المسؤولين» — هذا مساره الوحيد لتغيير كلمة مروره.
    const admin = await createSubAdmin(['orders'], { suffix: 860 });
    const first = await registerDevice(admin.token, 'first');
    const second = await registerDevice(admin.token, 'second');
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toEqual(expect.arrayContaining([first, second]));

    const changed = await changePassword(admin).expect(200);

    await api.get('/api/admin/me').set(bearer(admin.token)).expect(401);
    expect(await isActive(first)).toBe(false);
    expect(await isActive(second)).toBe(false);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toEqual([]);
    expect(await adminPushRepo.activeCount(db, admin.userId)).toBe(0);

    // الجلسة الجديدة التي أعادها الطلب صالحة، وتعيد هذا الجهاز وحده (`syncWebPush` في اللوحة).
    const fresh = changed.body.data.token as string;
    await api.get('/api/admin/me').set(bearer(fresh)).expect(200);
    await api.post('/api/admin/devices').set(bearer(fresh)).send({ token: first, platform: 'web' }).expect(200);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toEqual([first]);
  });

  it('أجهزة مسؤولٍ آخر لا تُمسّ', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 861 });
    const other = await createSubAdmin(['orders'], { suffix: 862 });
    const mine = await registerDevice(admin.token, 'mine');
    const theirs = await registerDevice(other.token, 'theirs');

    await changePassword(admin).expect(200);

    expect(await isActive(mine)).toBe(false);
    expect(await isActive(theirs)).toBe(true);
    expect(await pushOutboxRepo.adminTokens(db, other.userId)).toEqual([theirs]);
    await api.get('/api/admin/me').set(bearer(other.token)).expect(200);
  });

  it('كلمة حالية خاطئة: لا إبطال ولا تعطيل', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 863 });
    const device = await registerDevice(admin.token, 'wrong-current');
    await api
      .patch('/api/auth/me/password')
      .set(bearer(admin.token))
      .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD })
      .expect(400);
    await api.get('/api/admin/me').set(bearer(admin.token)).expect(200);
    expect(await isActive(device)).toBe(true);
  });

  it('[CRITICAL] ذرّياً: فشل الالتزام لا يترك جلسةً مُبطلة بجهازٍ نشط ولا العكس', async () => {
    suffixes.push(864);
    const admin = await createSubAdmin(['orders'], { suffix: 864 });
    const device = await registerDevice(admin.token, 'atomic');

    failNextCommit();
    const failed = await changePassword(admin);
    vi.restoreAllMocks();

    expect(failed.status).toBe(500);
    // لا شيء التزم: الجلسة القديمة صالحة والجهاز نشط — حالةٌ متّسقة، لا نصف إبطال.
    await api.get('/api/admin/me').set(bearer(admin.token)).expect(200);
    expect(await isActive(device)).toBe(true);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toEqual([device]);

    // المحاولة التالية تنجح وتُسقط الاثنين معاً.
    await changePassword(admin).expect(200);
    await api.get('/api/admin/me').set(bearer(admin.token)).expect(401);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toEqual([]);
  });
});
