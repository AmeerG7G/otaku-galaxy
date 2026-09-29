import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { ADMIN_SECTIONS } from '../src/domain/adminPermissions.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
} from './helpers.js';

/**
 * هرمية المسؤولين — تدقيقٌ عدائي (STEP 64).
 *
 * [SECURITY] كل حالة هنا محاولةٌ فعلية لتجاوز الهرمية: ترقيةٌ ذاتية، استهداف
 * المسؤول الأعلى بمعرّفه، الدخول إليه من مسارات الزبائن، إنشاء مسؤولٍ
 * بصلاحياتٍ مجهولة أو برقم زبون، وتسرّب كلمات المرور إلى سجلّ النشاط.
 * الحالات كُتبت لتسقط حين يُزال الحاجز (أُثبت بطفرات يدوية)، لا لتصف
 * السلوك القائم.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const SUPER_PHONE = '+9647800000000';

async function superId() {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [SUPER_PHONE]);
  return rows[0]!.id;
}

async function auditRows(targetId: string) {
  const { rows } = await db.query<{ action: string; details: unknown; actor_name: string; actor_id: string | null }>(
    `SELECT action, details, actor_name, actor_id FROM admin_audit_log
      WHERE target_id = $1 ORDER BY id`,
    [targetId],
  );
  return rows;
}

/**
 * السجلّ العامّ يُكتب بعد انتهاء الردّ (`finish`)، فقد يصل الاستعلام قبله.
 * ننتظر حتى يتحقق الشرط (أو تنقضي ثانيتان) بدل نومٍ ثابت يتقلّب نجاحه.
 */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 2000;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    value = await read();
  }
  return value;
}

/** كل نصّ السجلّ — للبحث عن كلمة مرورٍ مرسَلة في أي صفٍّ وأي عمق. */
async function wholeAuditLog() {
  const { rows } = await db.query<{ blob: string }>(
    `SELECT COALESCE(string_agg(action || ' ' || details::text || ' ' || actor_name, E'\n'), '') AS blob
       FROM admin_audit_log`,
  );
  return rows[0]!.blob;
}

describe('admin hierarchy — adversarial', () => {
  let superToken: string;
  let superUserId: string;

  beforeAll(async () => {
    superToken = await createAdminUser();
    superUserId = await superId();
  });

  afterAll(async () => {
    await purgeSubAdmins();
    await purgeTestUsers();
  });

  it('GET /admin/me returns only the caller — a sub-admin never sees the super admin', async () => {
    const sub = await createSubAdmin(['orders', 'reviews'], { suffix: 1 });
    const res = await api.get('/api/admin/me').set(bearer(sub.token)).expect(200);
    expect(res.body.data).toEqual({
      id: sub.userId,
      username: 'مسؤول فرعي',
      phone: sub.phone,
      isSuperAdmin: false,
      permissions: ['orders', 'reviews'],
    });
    expect(JSON.stringify(res.body)).not.toContain(SUPER_PHONE);

    const mine = await api.get('/api/admin/me').set(bearer(superToken)).expect(200);
    expect(mine.body.data).toMatchObject({ id: superUserId, isSuperAdmin: true, permissions: [] });
  });

  it('[SECURITY] a sub-admin — even holding every section — cannot manage admins or read the audit log', async () => {
    const all = await createSubAdmin([...ADMIN_SECTIONS], { suffix: 2 });
    const other = await createSubAdmin(['orders'], { suffix: 3 });
    const attempts = [
      api.get('/api/admin/admins'),
      api.post('/api/admin/admins').send({ username: 'دخيل', phone: '07800009901', password: 'password-123', permissions: ['admins'] }),
      api.patch(`/api/admin/admins/${other.userId}`).send({ permissions: [...ADMIN_SECTIONS] }),
      api.patch(`/api/admin/admins/${all.userId}`).send({ permissions: [...ADMIN_SECTIONS] }),
      api.patch(`/api/admin/admins/${superUserId}`).send({ isActive: false }),
      api.delete(`/api/admin/admins/${other.userId}`),
      api.delete(`/api/admin/admins/${superUserId}`),
      api.get('/api/admin/audit'),
    ];
    for (const attempt of attempts) {
      const res = await attempt.set(bearer(all.token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
    }
    // لا أثر: الآخر ما زال بصلاحيته وحدها، ولم يُنشأ «دخيل».
    const other2 = await db.query<{ admin_permissions: string[] }>('SELECT admin_permissions FROM users WHERE id = $1', [other.userId]);
    expect(other2.rows[0]!.admin_permissions).toEqual(['orders']);
    const intruder = await db.query('SELECT 1 FROM users WHERE phone = $1', ['+9647800009901']);
    expect(intruder.rowCount).toBe(0);
  });

  it('[SECURITY] PATCH /admin/me refuses self-escalation keys (strict body) and changes nothing', async () => {
    const sub = await createSubAdmin(['admins'], { suffix: 4 });
    for (const body of [
      { permissions: [...ADMIN_SECTIONS] },
      { isSuperAdmin: true },
      { username: 'مرقّى', is_super_admin: true },
      { username: 'مرقّى', admin_permissions: ['orders'] },
      { username: 'مرقّى', role: 'admin', id: superUserId },
    ]) {
      const res = await api.patch('/api/admin/me').set(bearer(sub.token)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const row = await db.query<{ username: string; admin_permissions: string[]; is_super_admin: boolean }>(
      'SELECT username, admin_permissions, is_super_admin FROM users WHERE id = $1',
      [sub.userId],
    );
    expect(row.rows[0]).toEqual({ username: 'مسؤول فرعي', admin_permissions: ['admins'], is_super_admin: false });
  });

  it('a sub-admin without the «admins» section cannot edit even their own profile', async () => {
    const sub = await createSubAdmin(['orders'], { suffix: 5 });
    const res = await api.patch('/api/admin/me').set(bearer(sub.token)).send({ username: 'اسم جديد' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
  });

  it('[SECURITY] revoking sessions revokes push devices — own password change, reset, disable; a rename does not', async () => {
    // جهازٌ مسجَّل قناةٌ مستقلّة عن الجلسة تحمل أسماء الزبائن وأرقامهم؛ من
    // سجّل متصفّحه بتوكنٍ مسروق لا يبقى يستقبلها بعد أن تسقط الجلسات.
    const device = (label: string) => `step64-revoke-${label}-${randomUUID()}`;
    const active = async (token: string) =>
      (await db.query<{ is_active: boolean }>('SELECT is_active FROM admin_push_devices WHERE token = $1', [token]))
        .rows[0]?.is_active;
    const register = async (session: string, token: string) =>
      api.post('/api/admin/devices').set(bearer(session)).send({ token, platform: 'web' }).expect(200);

    // ١) تغيير كلمة المرور الذاتي: الأجهزة كلّها تتعطّل، والجهاز الشرعي يعيد
    //    التسجيل بالتوكن الجديد.
    const self = await createSubAdmin(['admins'], { suffix: 50 });
    const own = device('own');
    await register(self.token, own);
    await api.patch('/api/admin/me').set(bearer(self.token)).send({ username: 'اسم فقط' }).expect(200);
    expect(await active(own)).toBe(true);
    const changed = await api
      .patch('/api/admin/me')
      .set(bearer(self.token))
      .send({ newPassword: 'rotated-password-50', currentPassword: self.password })
      .expect(200);
    expect(await active(own)).toBe(false);
    await register(changed.body.data.token as string, own);
    expect(await active(own)).toBe(true);
    // التوكن القديم لا يعيد تفعيل شيء.
    const stolen = device('stolen');
    const refused = await api.post('/api/admin/devices').set(bearer(self.token)).send({ token: stolen, platform: 'web' });
    expect(refused.status).toBe(401);

    // ٢) إعادة التعيين من المسؤول الأعلى، ٣) الإيقاف — والاسم وحده لا يمسّ شيئاً.
    for (const [suffix, body] of [
      [51, { newPassword: 'reset-by-super-51' }],
      [52, { isActive: false }],
    ] as const) {
      const sub = await createSubAdmin(['orders'], { suffix });
      const token = device(`target-${suffix}`);
      await register(sub.token, token);
      await api.patch(`/api/admin/admins/${sub.userId}`).set(bearer(superToken)).send({ username: 'اسم آخر' }).expect(200);
      expect(await active(token)).toBe(true);
      await api.patch(`/api/admin/admins/${sub.userId}`).set(bearer(superToken)).send(body).expect(200);
      expect(await active(token), JSON.stringify(body)).toBe(false);
    }
  });

  it('a sub-admin with «admins» edits only their own name/phone/password — phone and password need the current password', async () => {
    const sub = await createSubAdmin(['admins'], { suffix: 6 });

    const renamed = await api.patch('/api/admin/me').set(bearer(sub.token)).send({ username: 'اسم جديد' }).expect(200);
    expect(renamed.body.data.profile.username).toBe('اسم جديد');
    expect(renamed.body.data.token).toBeNull();

    const noCurrent = await api.patch('/api/admin/me').set(bearer(sub.token)).send({ phone: '07800009906' });
    expect(noCurrent.status).toBe(400);
    const wrong = await api.patch('/api/admin/me').set(bearer(sub.token)).send({ phone: '07800009906', currentPassword: 'not-it-at-all' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    // رقم المسؤول الأعلى محجوز — لا انتحال لرقمه.
    const taken = await api.patch('/api/admin/me').set(bearer(sub.token)).send({ phone: '07800000000', currentPassword: sub.password });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('PHONE_TAKEN');

    await api.patch('/api/admin/me').set(bearer(sub.token)).send({ phone: '07800009906', currentPassword: sub.password }).expect(200);

    const changed = await api
      .patch('/api/admin/me')
      .set(bearer(sub.token))
      .send({ newPassword: 'brand-new-password-6', currentPassword: sub.password })
      .expect(200);
    const fresh = changed.body.data.token as string;
    expect(typeof fresh).toBe('string');

    // الجلسة القديمة سقطت، والجديدة تعمل، والدخول بالرقم الجديد وكلمة المرور الجديدة.
    const stale = await api.get('/api/admin/me').set(bearer(sub.token));
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('SESSION_REVOKED');
    await api.get('/api/admin/me').set(bearer(fresh)).expect(200);
    await api.post('/api/auth/login').send({ phone: '07800009906', password: 'brand-new-password-6' }).expect(200);

    // الصلاحيات لم تتحرّك.
    const perms = await db.query<{ admin_permissions: string[] }>('SELECT admin_permissions FROM users WHERE id = $1', [sub.userId]);
    expect(perms.rows[0]!.admin_permissions).toEqual(['admins']);
    await db.query('DELETE FROM users WHERE id = $1', [sub.userId]);
  });

  it('[SECURITY] the super admin row is never a target of /admin/admins/:id — nor is a customer', async () => {
    const customer = await registerAndLogin();
    for (const id of [superUserId, customer.userId, randomUUID()]) {
      const patch = await api.patch(`/api/admin/admins/${id}`).set(bearer(superToken)).send({ permissions: ['orders'] });
      expect(patch.status).toBe(404);
      const del = await api.delete(`/api/admin/admins/${id}`).set(bearer(superToken));
      expect(del.status).toBe(404);
    }
    const self = await db.query<{ is_super_admin: boolean; admin_permissions: string[]; is_active: boolean }>(
      'SELECT is_super_admin, admin_permissions, is_active FROM users WHERE id = $1',
      [superUserId],
    );
    expect(self.rows[0]).toEqual({ is_super_admin: true, admin_permissions: [], is_active: true });
    const cust = await db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [customer.userId]);
    expect(cust.rows[0]!.role).toBe('customer');
    // والقائمة لا تحمل المسؤول الأعلى أصلاً.
    const list = await api.get('/api/admin/admins').set(bearer(superToken)).expect(200);
    expect(list.body.data.items.map((a: { id: string }) => a.id)).not.toContain(superUserId);
  });

  it('[SECURITY] customer routes cannot reach any admin row (super or sub) — 404, nothing changes', async () => {
    const customersAdmin = await createSubAdmin(['customers', 'points'], { suffix: 7 });
    const victim = await createSubAdmin(['orders'], { suffix: 8 });
    for (const id of [superUserId, victim.userId]) {
      const suspend = await api.patch(`/api/admin/users/${id}/active`).set(bearer(customersAdmin.token)).send({ isActive: false });
      expect(suspend.status).toBe(404);
      const detail = await api.get(`/api/admin/customers/${id}`).set(bearer(customersAdmin.token));
      expect(detail.status).toBe(404);
      const points = await api.get(`/api/admin/customers/${id}/points`).set(bearer(customersAdmin.token));
      expect(points.status).toBe(404);
      const reset = await api
        .patch(`/api/admin/customers/${id}/password`)
        .set(bearer(customersAdmin.token))
        .send({ newPassword: 'hijacked-pass-1' });
      expect(reset.status).toBe(404);
      for (const res of [suspend, detail, points, reset]) {
        expect(JSON.stringify(res.body)).not.toContain(SUPER_PHONE);
      }
    }
    // المسؤول الأعلى ما زال فعّالاً وجلسته تعمل؛ والضحية كذلك.
    await api.get('/api/admin/me').set(bearer(superToken)).expect(200);
    await api.get('/api/admin/orders').set(bearer(victim.token)).expect(200);
    // وقائمة الزبائن لا تُدرج مسؤولاً.
    const users = await api.get('/api/admin/users?limit=100&search=780000').set(bearer(customersAdmin.token)).expect(200);
    expect(users.body.data.items).toEqual([]);
  });

  it('creating an admin: unknown permission → 400, customer phone → 409 (never a silent promotion), strict body', async () => {
    const customer = await registerAndLogin();
    const unknown = await api
      .post('/api/admin/admins')
      .set(bearer(superToken))
      .send({ username: 'مسؤول', phone: '07800009910', password: 'password-123', permissions: ['everything'] });
    expect(unknown.status).toBe(400);

    const promote = await api
      .post('/api/admin/admins')
      .set(bearer(superToken))
      .send({ username: 'مسؤول', phone: customer.phone, password: 'password-123', permissions: ['orders'] });
    expect(promote.status).toBe(409);
    expect(promote.body.error.code).toBe('PHONE_TAKEN');
    const still = await db.query<{ role: string; admin_permissions: string[] }>(
      'SELECT role, admin_permissions FROM users WHERE id = $1',
      [customer.userId],
    );
    expect(still.rows[0]).toEqual({ role: 'customer', admin_permissions: [] });

    const superFlag = await api
      .post('/api/admin/admins')
      .set(bearer(superToken))
      .send({ username: 'مسؤول', phone: '07800009910', password: 'password-123', permissions: [], isSuperAdmin: true });
    expect(superFlag.status).toBe(400);
    const none = await db.query('SELECT 1 FROM users WHERE phone = $1', ['+9647800009910']);
    expect(none.rowCount).toBe(0);
  });

  it('full lifecycle: create → login → permissions → disable → reset password → delete, each audited without secrets', async () => {
    const initialPassword = 'initial-secret-9910';
    const resetPassword = 'reset-secret-9910x';
    const created = await api
      .post('/api/admin/admins')
      .set(bearer(superToken))
      .send({ username: 'مشرف الطلبات', phone: '07800009910', password: initialPassword, permissions: ['orders', 'orders', 'reviews'] })
      .expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ username: 'مشرف الطلبات', phone: '+9647800009910', isActive: true, permissions: ['orders', 'reviews'] });
    expect(JSON.stringify(created.body)).not.toContain(initialPassword);

    const login = await api.post('/api/auth/login').send({ phone: '07800009910', password: initialPassword }).expect(200);
    const token = login.body.data.token as string;
    await api.get('/api/admin/orders').set(bearer(token)).expect(200);
    expect((await api.get('/api/admin/products').set(bearer(token))).status).toBe(403);

    await api.patch(`/api/admin/admins/${id}`).set(bearer(superToken)).send({ permissions: ['products'] }).expect(200);
    await api.get('/api/admin/products').set(bearer(token)).expect(200);

    await api.patch(`/api/admin/admins/${id}`).set(bearer(superToken)).send({ isActive: false }).expect(200);
    const suspended = await api.get('/api/admin/products').set(bearer(token));
    expect([401, 403]).toContain(suspended.status);
    await api.patch(`/api/admin/admins/${id}`).set(bearer(superToken)).send({ isActive: true }).expect(200);

    const relog = await api.post('/api/auth/login').send({ phone: '07800009910', password: initialPassword }).expect(200);
    await api.patch(`/api/admin/admins/${id}`).set(bearer(superToken)).send({ newPassword: resetPassword }).expect(200);
    expect((await api.get('/api/admin/me').set(bearer(relog.body.data.token))).status).toBe(401);
    await api.post('/api/auth/login').send({ phone: '07800009910', password: resetPassword }).expect(200);

    // عملٌ حقيقي باسمه قبل الحذف — يبقى في السجلّ باسمه بعده.
    const actorToken = (await api.post('/api/auth/login').send({ phone: '07800009910', password: resetPassword })).body.data.token;
    await api.patch(`/api/admin/restock/${randomUUID()}/schedule`).set(bearer(actorToken)).send({ restockAt: null });

    await api.delete(`/api/admin/admins/${id}`).set(bearer(superToken)).expect(204);
    expect((await db.query('SELECT 1 FROM users WHERE id = $1', [id])).rowCount).toBe(0);

    const actions = (await auditRows(id)).map((row) => row.action);
    expect(actions).toEqual([
      'admin.created',
      'admin.permissions_changed',
      'admin.disabled',
      'admin.enabled',
      'admin.password_reset',
      'admin.deleted',
    ]);
    const permissionRow = (await auditRows(id)).find((row) => row.action === 'admin.permissions_changed')!;
    expect(permissionRow.details).toMatchObject({ before: ['orders', 'reviews'], after: ['products'], added: ['products'], removed: ['orders', 'reviews'] });

    const blob = await wholeAuditLog();
    expect(blob).not.toContain(initialPassword);
    expect(blob).not.toContain(resetPassword);
    expect(blob).not.toMatch(/\$2[aby]\$/); // لا تجزئة bcrypt
  });

  it('the generic audit records a sub-admin mutation by route and field names only — never values', async () => {
    const sub = await createSubAdmin(['account_requests', 'customers'], { suffix: 9 });
    const customer = await registerAndLogin();
    await api
      .patch(`/api/admin/customers/${customer.userId}/password`)
      .set(bearer(sub.token))
      .send({ newPassword: 'visible-if-leaked-77', note: 'تحقّق واتساب' })
      .expect(200);
    const rows = await eventually(
      () => auditRows(customer.userId),
      (found) => found.some((row) => row.action === 'PATCH /customers/:id/password'),
    );
    const entry = rows.find((row) => row.action === 'PATCH /customers/:id/password');
    expect(entry).toBeDefined();
    expect(entry!.actor_id).toBe(sub.userId);
    expect(entry!.actor_name).toBe('مسؤول فرعي');
    expect(entry!.details).toEqual({ fields: ['note'] });
    expect(await wholeAuditLog()).not.toContain('visible-if-leaked-77');

    // الرفض لا يُسجَّل: لم يتغيّر شيء.
    // (مقارنةٌ بطلبٍ ناجح لاحق: لو سُجّل الرفض لسبق صفُّه صفَّ النجاح.)
    const before = (await auditRows(customer.userId)).length;
    const denied = await api
      .patch(`/api/admin/users/${customer.userId}/active`)
      .set(bearer((await createSubAdmin(['orders'], { suffix: 10 })).token))
      .send({ isActive: false });
    expect(denied.status).toBe(403);
    await api.patch(`/api/admin/users/${customer.userId}/active`).set(bearer(sub.token)).send({ isActive: false }).expect(200);
    const after = await eventually(
      () => auditRows(customer.userId),
      (found) => found.length > before,
    );
    expect(after.slice(before).map((row) => [row.action, row.actor_id])).toEqual([
      ['PATCH /users/:id/active', sub.userId],
    ]);
  });

  it('the audit log is readable by the super admin, paginated and filterable by actor', async () => {
    const sub = await createSubAdmin(['account_requests', 'customers'], { suffix: 9 });
    const res = await api.get(`/api/admin/audit?actorId=${sub.userId}&limit=5`).set(bearer(superToken)).expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    for (const item of res.body.data.items) expect(item.actorId).toBe(sub.userId);
    expect(res.body.data).toMatchObject({ page: 1, limit: 5 });
  });
});
