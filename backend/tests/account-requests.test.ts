import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * طلبات الحساب التي تحسمها الإدارة — الدورة الكاملة والحالات العدائية.
 *
 * ═══ ما يُثبته هذا الملف ═══
 * - التسجيل ينشئ طلباً معلَّقاً؛ الحساب لا يدخل قبل الموافقة؛ الرفض يبقى في
 *   السجل؛ لا نسخ مكرّرة للمعلَّق.
 * - نسيان كلمة المرور ينشئ طلباً بمعلومات تعريفٍ **لا تصادق**: مطابقتها
 *   كاملاً لا تغيّر شيئاً؛ الإدارة وحدها تضع كلمة مرور جديدة **دائمة**.
 * - لا حالة «مؤقّتة» ولا `must_change_password` ولا إجبار بعد الدخول:
 *   الزبون يدخل بالكلمة الجديدة ويصل مسارات محمية فوراً، وله أن يغيّرها من
 *   الإعدادات متى شاء.
 * - الزبون لا يصل مسارات اللوحة، لا يوافق على طلبه، لا يضع كلمة مرور لأحد؛
 *   معرّف الطلب لا يخوِّل وحده؛ المعرّفات المزوّرة تُرفض.
 * - كلمة المرور لا تُعاد في أي ردّ، لا تُخزَّن نصّاً، ولا تُسجَّل في السجل.
 */

const TEST_PHONE_PREFIX = '077';
function freshPhone() {
  return `${TEST_PHONE_PREFIX}${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

let adminToken: string;

async function submitRegistration(overrides: Partial<{ username: string; phone: string; password: string; gender: 'male' | 'female' }> = {}) {
  const body = { username: 'طالب حساب', phone: freshPhone(), password: 'first-pass-1', gender: 'male' as const, ...overrides };
  const res = await api.post('/api/auth/register').send(body).expect(202);
  return { ...body, requestId: res.body.data.request.id as string, userId: res.body.data.user.id as string, canonicalPhone: res.body.data.user.phone as string };
}

const admin = () => ({ Authorization: `Bearer ${adminToken}` });

beforeAll(async () => {
  await purgeTestUsers();
  adminToken = await createAdminUser();
});
afterAll(async () => {
  await purgeTestUsers();
});

describe('[CRITICAL] طلب إنشاء الحساب', () => {
  it('يظهر للإدارة معلَّقاً بمعلومات التسجيل، وبلا كلمة مرور', async () => {
    const r = await submitRegistration({ username: 'زبونة جديدة', gender: 'female' });
    const list = await api.get('/api/admin/account-requests?kind=registration&status=pending').set(admin()).expect(200);
    const item = (list.body.data.items as Array<Record<string, unknown>>).find((i) => i.id === r.requestId);
    expect(item).toBeDefined();
    expect(item!.kind).toBe('registration');
    expect(item!.status).toBe('pending');
    expect((item!.submitted as Record<string, unknown>).username).toBe('زبونة جديدة');
    expect((item!.submitted as Record<string, unknown>).gender).toBe('female');
    expect((item!.account as Record<string, unknown>).isVerified).toBe(false);
    expect(JSON.stringify(item)).not.toContain('first-pass-1');
    expect(JSON.stringify(item)).not.toMatch(/password|hash|token/i);
    expect(list.body.data.pending.registration).toBeGreaterThanOrEqual(1);
  });

  it('[CRITICAL] الموافقة تفعّل الحساب — والدخول يعمل بعدها فقط', async () => {
    const r = await submitRegistration();
    await api.post('/api/auth/login').send({ phone: r.phone, password: r.password }).expect(403);

    const approved = await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(admin()).send({ note: 'تحقّقت عبر واتساب' }).expect(200);
    expect(approved.body.data.status).toBe('approved');
    expect(approved.body.data.adminNote).toBe('تحقّقت عبر واتساب');
    expect(approved.body.data.resolvedAt).toBeTruthy();

    const { rows } = await db.query<{ phone_verified_at: Date | null }>('SELECT phone_verified_at FROM users WHERE id = $1', [r.userId]);
    expect(rows[0]!.phone_verified_at).not.toBeNull();

    const login = await api.post('/api/auth/login').send({ phone: r.phone, password: r.password }).expect(200);
    expect(login.body.data.token).toBeTruthy();
  });

  it('[CRITICAL] الرفض يبقي الطلب في السجل والحساب غير مفعَّل، والدخول يقول «مرفوض»', async () => {
    const r = await submitRegistration();
    const rejected = await api.post(`/api/admin/account-requests/${r.requestId}/reject`).set(admin()).send({ note: 'لم يردّ على واتساب' }).expect(200);
    expect(rejected.body.data.status).toBe('rejected');

    const { rows } = await db.query<{ status: string; admin_note: string; verified: boolean }>(
      `SELECT r.status, r.admin_note, u.phone_verified_at IS NOT NULL AS verified
         FROM account_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
      [r.requestId],
    );
    expect(rows[0]).toMatchObject({ status: 'rejected', admin_note: 'لم يردّ على واتساب', verified: false });

    const login = await api.post('/api/auth/login').send({ phone: r.phone, password: r.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_REQUEST_REJECTED');

    // ويظهر في قائمة المرفوض لا يختفي.
    const list = await api.get('/api/admin/account-requests?status=rejected').set(admin()).expect(200);
    expect((list.body.data.items as Array<{ id: string }>).some((i) => i.id === r.requestId)).toBe(true);
  });

  it('طلبٌ محسوم لا يُحسم ثانيةً', async () => {
    const r = await submitRegistration();
    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(admin()).expect(200);
    const again = await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(admin());
    expect(again.status).toBe(409);
    const reject = await api.post(`/api/admin/account-requests/${r.requestId}/reject`).set(admin());
    expect(reject.status).toBe(409);
  });

  it('إعادة التسجيل بنفس الرقم تستأنف الطلب المعلَّق — لا نسخة ثانية', async () => {
    const r = await submitRegistration({ username: 'الاسم الأول' });
    const again = await api.post('/api/auth/register').send({ username: 'الاسم المصحَّح', phone: r.phone, password: 'second-pass-2', gender: 'female' }).expect(202);
    expect(again.body.data.request.id).toBe(r.requestId);
    const { rows } = await db.query<{ n: string; submitted_username: string }>(
      `SELECT COUNT(*)::text AS n, MAX(submitted_username) AS submitted_username FROM account_requests
        WHERE kind = 'registration' AND submitted_phone = $1 AND status = 'pending'`,
      [r.canonicalPhone],
    );
    expect(rows[0]!.n).toBe('1');
    expect(rows[0]!.submitted_username).toBe('الاسم المصحَّح');
  });

  it('بعد رفضٍ يمكن إعادة التسجيل فينشأ طلبٌ جديد والقديم يبقى', async () => {
    const r = await submitRegistration();
    await api.post(`/api/admin/account-requests/${r.requestId}/reject`).set(admin()).expect(200);
    const again = await api.post('/api/auth/register').send({ username: 'محاولة ثانية', phone: r.phone, password: r.password, gender: 'male' }).expect(202);
    expect(again.body.data.request.id).not.toBe(r.requestId);
    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM account_requests WHERE kind = 'registration' AND submitted_phone = $1 ORDER BY created_at`,
      [r.canonicalPhone],
    );
    expect(rows.map((x) => x.status)).toEqual(['rejected', 'pending']);
  });

  it('البحث بالرقم المحلي (0771…) يجد الطلب المخزَّن بصيغة +964', async () => {
    const r = await submitRegistration();
    const list = await api.get(`/api/admin/account-requests?search=${r.phone}`).set(admin()).expect(200);
    expect((list.body.data.items as Array<{ id: string }>).some((i) => i.id === r.requestId)).toBe(true);
  });

  it('بيانات مشوَّهة تُرفض قبل أن تُنشئ شيئاً', async () => {
    const before = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM account_requests`);
    await api.post('/api/auth/register').send({ username: 'x', phone: 'abc', password: '1', gender: 'other' }).expect(400);
    const after = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM account_requests`);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});

describe('[CRITICAL] طلب إعادة تعيين كلمة المرور', () => {
  it('يظهر للإدارة مع لقطة الحساب وإشارات المطابقة — ولا يغيّر شيئاً بنفسه', async () => {
    const c = await registerAndLogin(undefined, 'female');
    const res = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'مختبر', gender: 'female', levelKey: 'beginner' }).expect(202);
    const requestId = res.body.data.request.id as string;

    const detail = await api.get(`/api/admin/account-requests/${requestId}`).set(admin()).expect(200);
    expect(detail.body.data.kind).toBe('password_reset');
    expect(detail.body.data.account.id).toBe(c.userId);
    expect(detail.body.data.match).toEqual({ username: true, gender: true, level: true });
    expect(JSON.stringify(detail.body)).not.toMatch(/password_hash|token_version/);

    // المطابقة الكاملة لم تغيّر كلمة المرور ولم تفتح جلسة.
    await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(200);
    expect(res.body.data.token).toBeUndefined();
  });

  it('معلومات خاطئة تُنشئ طلباً أيضاً (لا كشف) — وإشارات المطابقة تكشف الفرق للمسؤول', async () => {
    const c = await registerAndLogin(undefined, 'male');
    const res = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'اسم آخر', gender: 'female', levelKey: 'legend' }).expect(202);
    const detail = await api.get(`/api/admin/account-requests/${res.body.data.request.id}`).set(admin()).expect(200);
    expect(detail.body.data.match).toEqual({ username: false, gender: false, level: false });
    // وكلمة المرور القديمة ما تزال هي.
    await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(200);
  });

  it('رقمٌ بلا حساب: طلبٌ بلا حساب مرتبط، والردّ لا يختلف', async () => {
    const res = await api.post('/api/auth/forgot-password').send({ phone: freshPhone(), username: 'لا أحد', gender: 'male', levelKey: 'beginner' }).expect(202);
    const detail = await api.get(`/api/admin/account-requests/${res.body.data.request.id}`).set(admin()).expect(200);
    expect(detail.body.data.account).toBeNull();
    expect(detail.body.data.match).toBeNull();
  });

  it('مستوى غير معروف يُرفض', async () => {
    await api.post('/api/auth/forgot-password').send({ phone: freshPhone(), username: 'x y', gender: 'male', levelKey: 'god' }).expect(400);
  });

  it('طلبٌ معلَّق واحد لكل رقم — التكرار يستأنفه', async () => {
    const c = await registerAndLogin();
    const a = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'الأول', gender: 'male', levelKey: 'beginner' }).expect(202);
    const b = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'الثاني', gender: 'male', levelKey: 'beginner' }).expect(202);
    expect(b.body.data.request.id).toBe(a.body.data.request.id);
  });

  it('[CRITICAL] «موافقة» على طلب إعادة تعيين بلا كلمة مرور مرفوضة — الحسم بوضع الكلمة فقط', async () => {
    const c = await registerAndLogin();
    const res = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    const approve = await api.post(`/api/admin/account-requests/${res.body.data.request.id}/approve`).set(admin());
    expect(approve.status).toBe(400);
    expect(approve.body.error.code).toBe('USE_SET_PASSWORD');
  });
});

describe('[CRITICAL] المسؤول يضع كلمة مرور جديدة دائمة', () => {
  it('الكلمة الجديدة تعمل كأي كلمة مرور — لا إجبار ولا حالة مؤقّتة ولا شاشة إضافية', async () => {
    const c = await registerAndLogin();
    const req = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    const requestId = req.body.data.request.id as string;

    const logSpy = vi.spyOn(console, 'log');
    const errSpy = vi.spyOn(console, 'error');
    const set = await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'admin-set-pass-9', requestId, note: 'تحقّقت من الاسم والمستوى عبر واتساب' }).expect(200);
    const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join('\n');
    logSpy.mockRestore();
    errSpy.mockRestore();

    // لا كلمة في الردّ ولا في السجلّ ولا نصّاً في القاعدة.
    expect(JSON.stringify(set.body)).not.toContain('admin-set-pass-9');
    expect(logged).not.toContain('admin-set-pass-9');
    expect(set.body.data.request).toEqual({ id: requestId, status: 'approved' });
    const { rows: [u] } = await db.query<Record<string, unknown>>('SELECT * FROM users WHERE id = $1', [c.userId]);
    expect(String(u!.password_hash)).not.toContain('admin-set-pass-9');
    expect(String(u!.password_hash).startsWith('$2')).toBe(true);
    // لا عمود «مؤقّتة» ولا «يجب التغيير» ولا انتهاء — لا وجود لها في المخطّط أصلاً.
    expect(Object.keys(u!).filter((k) => /temp|must_change|expire|force/i.test(k))).toEqual([]);

    // القديمة لا تعمل، الجديدة تعمل — وتعطي جلسةً عاديةً تصل المسارات المحمية فوراً.
    await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(401);
    const login = await api.post('/api/auth/login').send({ phone: c.phone, password: 'admin-set-pass-9' }).expect(200);
    expect(Object.keys(login.body.data).sort()).toEqual(['token', 'user']);
    expect(JSON.stringify(login.body.data.user)).not.toMatch(/mustChange|temporary|forceChange|passwordExpir/i);
    await api.get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);
    await api.get('/api/cart').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);

    // وتبقى دائمةً: دخولٌ ثانٍ بها بعد الأول ينجح كذلك.
    await api.post('/api/auth/login').send({ phone: c.phone, password: 'admin-set-pass-9' }).expect(200);

    // الجلسات السابقة أُبطلت (من استعاد حسابه بعد اختراق).
    await api.get('/api/auth/me').set('Authorization', `Bearer ${c.token}`).expect(401);

    // ويغيّرها لاحقاً من الإعدادات إن شاء — اختيارياً، بكلمته الحالية.
    await api.patch('/api/auth/me/password').set('Authorization', `Bearer ${login.body.data.token}`).send({ currentPassword: 'admin-set-pass-9', newPassword: 'my-own-pass-10' }).expect(200);
    await api.post('/api/auth/login').send({ phone: c.phone, password: 'my-own-pass-10' }).expect(200);
  });

  it('بلا requestId أيضاً — من ملفّ الزبون مباشرةً', async () => {
    const c = await registerAndLogin();
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'direct-set-11' }).expect(200);
    await api.post('/api/auth/login').send({ phone: c.phone, password: 'direct-set-11' }).expect(200);
  });

  it('[CRITICAL] معرّف طلبٍ لحسابٍ آخر لا يخوِّل — الطلب لا يخصّ هذا الحساب', async () => {
    const victim = await registerAndLogin();
    const other = await registerAndLogin();
    const req = await api.post('/api/auth/forgot-password').send({ phone: other.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    const res = await api.patch(`/api/admin/customers/${victim.userId}/password`).set(admin()).send({ newPassword: 'hijack-pass-12', requestId: req.body.data.request.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUEST_ACCOUNT_MISMATCH');
    await api.post('/api/auth/login').send({ phone: victim.phone, password: victim.password }).expect(200);
  });

  it('طلبٌ محسوم لا يُستعمل ثانيةً', async () => {
    const c = await registerAndLogin();
    const req = await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    const id = req.body.data.request.id as string;
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'once-pass-13', requestId: id }).expect(200);
    const again = await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'twice-pass-14', requestId: id });
    expect(again.status).toBe(409);
  });

  it('معرّفات مزوّرة تُرفض', async () => {
    const c = await registerAndLogin();
    await api.patch(`/api/admin/customers/00000000-0000-4000-8000-000000000000/password`).set(admin()).send({ newPassword: 'ghost-pass-15' }).expect(404);
    await api.patch(`/api/admin/customers/not-a-uuid/password`).set(admin()).send({ newPassword: 'ghost-pass-15' }).expect(400);
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'x', requestId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'ghost-pass-15', requestId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    await api.post('/api/admin/account-requests/00000000-0000-4000-8000-000000000000/approve').set(admin()).expect(404);
  });

  it('لا يُغيَّر بها حساب مسؤول', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const res = await api.patch(`/api/admin/customers/${rows[0]!.id}/password`).set(admin()).send({ newPassword: 'admin-pass-16' });
    expect(res.status).toBe(404);
  });

  it('كلمة قصيرة تُرفض بنفس قاعدة التسجيل', async () => {
    const c = await registerAndLogin();
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(admin()).send({ newPassword: 'short' }).expect(400);
  });
});

describe('[CRITICAL] الزبون لا يملك شيئاً من مسارات الإدارة', () => {
  it('لا يرى الطلبات ولا يوافق على طلبه ولا يضع كلمة مرور لأحد', async () => {
    const r = await submitRegistration();
    const c = await registerAndLogin();
    const bearer = { Authorization: `Bearer ${c.token}` };
    await api.get('/api/admin/account-requests').set(bearer).expect(403);
    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set(bearer).expect(403);
    await api.post(`/api/admin/account-requests/${r.requestId}/reject`).set(bearer).expect(403);
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(bearer).send({ newPassword: 'self-set-17' }).expect(403);
    await api.patch(`/api/admin/customers/${r.userId}/password`).set(bearer).send({ newPassword: 'other-set-18' }).expect(403);
    await api.get(`/api/admin/customers/${r.userId}`).set(bearer).expect(403);
    // ولا شيء تغيّر.
    const { rows } = await db.query<{ status: string }>('SELECT status FROM account_requests WHERE id = $1', [r.requestId]);
    expect(rows[0]!.status).toBe('pending');
    await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(200);
  });

  it('بلا جلسة، وبتوكن مزوّر: مرفوض', async () => {
    const r = await submitRegistration();
    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).expect(401);
    await api.post(`/api/admin/account-requests/${r.requestId}/approve`).set('Authorization', 'Bearer forged.token.value').expect(401);
    await api.patch(`/api/admin/customers/${r.userId}/password`).set('Authorization', 'Bearer forged.token.value').send({ newPassword: 'forged-pass-19' }).expect(401);
  });
});

describe('البحث في الزبائن وملفّ الزبون', () => {
  it('بالهاتف وبالاسم وبالمعرّف وبالمستوى', async () => {
    const c = await registerAndLogin();
    const byPhone = await api.get(`/api/admin/users?search=${encodeURIComponent(c.phone)}`).set(admin()).expect(200);
    expect((byPhone.body.data.items as Array<{ id: string }>).some((u) => u.id === c.userId)).toBe(true);
    const byId = await api.get(`/api/admin/users?search=${c.userId.slice(0, 8)}`).set(admin()).expect(200);
    expect((byId.body.data.items as Array<{ id: string }>).some((u) => u.id === c.userId)).toBe(true);
    const byName = await api.get(`/api/admin/users?search=${encodeURIComponent('مختبر')}`).set(admin()).expect(200);
    expect(byName.body.data.items.length).toBeGreaterThan(0);
    const byLevel = await api.get(`/api/admin/users?levelKey=beginner&search=${encodeURIComponent(c.phone)}`).set(admin()).expect(200);
    expect((byLevel.body.data.items as Array<{ id: string }>).some((u) => u.id === c.userId)).toBe(true);
    const wrongLevel = await api.get(`/api/admin/users?levelKey=legend&search=${encodeURIComponent(c.phone)}`).set(admin()).expect(200);
    expect((wrongLevel.body.data.items as Array<{ id: string }>).some((u) => u.id === c.userId)).toBe(false);
    await api.get('/api/admin/users?levelKey=nope').set(admin()).expect(400);
  });

  it('الملفّ الكامل: هوية، نقاط ومستوى، طلبات شراء، تاريخ طلبات الحساب — بلا أسرار', async () => {
    const c = await registerAndLogin();
    await api.post('/api/auth/forgot-password').send({ phone: c.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    const res = await api.get(`/api/admin/customers/${c.userId}`).set(admin()).expect(200);
    const d = res.body.data;
    expect(d.profile).toMatchObject({ id: c.userId, phone: c.phone, isVerified: true, isActive: true });
    expect(d.points.levelKey).toBe('beginner');
    expect(Array.isArray(d.orders.items)).toBe(true);
    expect(d.requests.map((r: { kind: string }) => r.kind).sort()).toEqual(['password_reset', 'registration']);
    expect(JSON.stringify(d)).not.toMatch(/password_hash|passwordHash|token_version|tokenVersion|"token"/);
  });
});
