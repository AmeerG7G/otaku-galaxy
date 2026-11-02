import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, approveAsAdmin, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * تدفّق المصادقة بعد إزالة رمز SMS.
 *
 * ═══ القرار ═══ التسجيل ينشئ **طلباً** تحسمه الإدارة؛ نسيان كلمة المرور
 * ينشئ طلباً كذلك؛ تغيير كلمة المرور من الإعدادات يبقى كما هو (بكلمة
 * المرور الحالية، بلا رمز). لا مسار عام يفعّل حساباً أو يغيّر كلمة مرور
 * بلا جلسة. التفاصيل الإدارية والحالات العدائية في `account-requests.test.ts`.
 */
describe('auth flow', () => {
  beforeAll(async () => {
    await purgeTestUsers();
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  it('rejects registration with invalid phone', async () => {
    const res = await api.post('/api/auth/register').send({
      username: 'مختبر',
      phone: '123',
      password: 'secret123',
      gender: 'male',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('[CRITICAL] registration → pending request → admin approval → login → me', async () => {
    const phone = `077${String(Date.now()).slice(-8)}`;

    const reg = await api.post('/api/auth/register').send({
      username: 'مختبر',
      phone,
      password: 'secret123',
      gender: 'male',
    });
    expect(reg.status).toBe(202);
    // لا رمز في الرسالة ولا توكن في الجسم — طلبٌ ينتظر الإدارة.
    expect(reg.body.message).not.toContain('رمز');
    expect(reg.body.data.token).toBeUndefined();
    expect(reg.body.data.request.status).toBe('pending');

    // قبل الموافقة: كلمة مرور صحيحة لا تفتح جلسة.
    const early = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');

    await approveAsAdmin(reg.body.data.request.id as string);

    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();
    // أُرسل `077…` وخُزّن `+96477…`: هذا هو التطبيع من طرف إلى طرف.
    expect(login.body.data.user.phone).toBe(`+964${phone.slice(1)}`);

    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.role).toBe('customer');
  });

  it('rejects duplicate phone registration', async () => {
    const { phone } = await registerAndLogin();
    const res = await api.post('/api/auth/register').send({
      username: 'آخر',
      phone,
      password: 'secret123',
      gender: 'male',
    });
    expect(res.status).toBe(409);
  });

  it('blocks unauthenticated customer routes', async () => {
    const res = await api.get('/api/cart');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('[CRITICAL] forgot-password creates a request and changes nothing by itself', async () => {
    const { phone, password, userId } = await registerAndLogin();
    const res = await api
      .post('/api/auth/forgot-password')
      .send({ phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' });
    expect(res.status).toBe(202);
    expect(res.body.data.request.status).toBe('pending');

    // معلومات مطابقة تماماً — ومع ذلك: كلمة المرور القديمة ما تزال تعمل،
    // ولا توكن في الردّ، ولا شيء تغيّر في الصفّ.
    expect(res.body.data.token).toBeUndefined();
    await api.post('/api/auth/login').send({ phone, password }).expect(200);
    const { rows } = await db.query<{ status: string; user_id: string }>(
      `SELECT status, user_id FROM account_requests
        WHERE kind = 'password_reset' AND submitted_phone = $1`,
      [phone],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.user_id).toBe(userId);
  });

  it('[CRITICAL] the old OTP endpoints are gone — even with a valid session', async () => {
    // بلا جلسة يردّ حاجز `/api` بـ401 قبل أن يُعرف المسار؛ بجلسةٍ صالحة يظهر
    // الفرق: مسارٌ قائم يردّ 200/400، ومسارٌ محذوف يردّ 404.
    const { token } = await registerAndLogin();
    for (const path of ['/api/auth/verify', '/api/auth/resend-code', '/api/auth/reset-password']) {
      const res = await api
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '07701234567', code: '123456', newPassword: 'x' });
      expect(res.status, path).toBe(404);
      expect(res.body.success, path).toBe(false);
    }
  });

  it('change password from settings (authenticated, no OTP)', async () => {
    const { phone, password, token } = await registerAndLogin();

    // كلمة مرور حالية خاطئة → مرفوض بـ400 ورمزٍ خاص. ليس 401: التطبيق يُنهي
    // الجلسة عند 401 (توكن مرفوض)، وخطأٌ مطبعي هنا لا يجوز أن يُخرج صاحبه.
    const wrong = await api
      .patch('/api/auth/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'brandnew99' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    // كلمة مرور حالية صحيحة → تُحدَّث فوراً بلا رمز تحقق.
    const ok = await api
      .patch('/api/auth/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'brandnew99' });
    expect(ok.status).toBe(200);

    // تسجيل الدخول بكلمة المرور القديمة يفشل، والجديدة تنجح.
    const oldLogin = await api.post('/api/auth/login').send({ phone, password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api.post('/api/auth/login').send({ phone, password: 'brandnew99' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects unauthenticated password change', async () => {
    const res = await api
      .patch('/api/auth/me/password')
      .send({ currentPassword: 'x', newPassword: 'newpass99' });
    expect(res.status).toBe(401);
  });
});

/**
 * التسجيل لا يفتح جلسة بنفسه — لا في الردّ ولا بأي كلمة مرور صحيحة قبل
 * موافقة الإدارة. كان `/verify` يعيد جلسةً فور الرمز؛ ذلك المسار لم يعد.
 */
describe('registration does not authenticate', () => {
  it('[CRITICAL] a fresh registration returns no session and cannot log in', async () => {
    const phone = `078${Math.floor(10000000 + Math.random() * 89999999)}`;
    const reg = await api
      .post('/api/auth/register')
      .send({ username: 'مختبر التحقق', phone, password: 'secret123', gender: 'male' })
      .expect(202);
    expect(reg.body.data.token).toBeUndefined();

    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(403);
    expect(login.body.data).toBeNull();

    // وفي القاعدة: الحساب موجود، غير مفعَّل، والطلب معلَّق.
    const { rows } = await db.query<{ verified: boolean; status: string }>(
      `SELECT u.phone_verified_at IS NOT NULL AS verified, r.status
         FROM users u JOIN account_requests r ON r.user_id = u.id
        WHERE u.phone = $1`,
      [`+964${phone.slice(1)}`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verified).toBe(false);
    expect(rows[0]!.status).toBe('pending');
    await db.query('DELETE FROM account_requests WHERE submitted_phone = $1', [`+964${phone.slice(1)}`]);
    await db.query('DELETE FROM users WHERE phone = $1', [`+964${phone.slice(1)}`]);
  });
});
