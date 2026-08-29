import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, DEV_CODE, purgeTestUsers, registerAndLogin } from './helpers.js';

describe('auth flow', () => {
  beforeAll(async () => {
    await purgeTestUsers('077%');
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('rejects registration with invalid phone', async () => {
    const res = await api.post('/api/auth/register').send({
      username: 'مختبر',
      phone: '123',
      password: 'secret123',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registration → OTP verification → login → me', async () => {
    const phone = `077${String(Date.now()).slice(-8)}`;

    const reg = await api.post('/api/auth/register').send({
      username: 'مختبر',
      phone,
      password: 'secret123',
    });
    expect(reg.status).toBe(200);
    expect(reg.body.message).toContain('رمز');

    const wrong = await api.post('/api/auth/verify').send({ phone, code: '999999' });
    expect(wrong.status).toBe(400);

    const verify = await api.post('/api/auth/verify').send({ phone, code: '123456' });
    expect(verify.status).toBe(200);

    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeTruthy();
    expect(login.body.data.user.phone).toBe(phone);

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
    });
    expect(res.status).toBe(409);
  });

  it('blocks unauthenticated customer routes', async () => {
    const res = await api.get('/api/cart');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('password reset via OTP', async () => {
    const { phone } = await registerAndLogin();
    await api.post('/api/auth/forgot-password').send({ phone }).expect(200);
    await api
      .post('/api/auth/reset-password')
      .send({ phone, code: '123456', newPassword: 'newpass99' })
      .expect(200);
    const login = await api.post('/api/auth/login').send({ phone, password: 'newpass99' });
    expect(login.status).toBe(200);
  });

  it('change password from settings (authenticated, no OTP)', async () => {
    const { phone, password, token } = await registerAndLogin();

    // كلمة مرور حالية خاطئة → مرفوض.
    const wrong = await api
      .patch('/api/auth/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'brandnew99' });
    expect(wrong.status).toBe(401);

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
 * التحقق من رمز التسجيل يجب أن يُنهي التسجيل بجلسة جاهزة.
 * كان يعيد null، فيصل المستخدم لشاشة محمية وهو غير مصادَق فيُعاد لتسجيل
 * الدخول رغم إتمامه التسجيل والتحقق بنجاح.
 */
describe('registration ends authenticated', () => {
  it('verify returns a working session', async () => {
    const phone = `078${Math.floor(10000000 + Math.random() * 89999999)}`;
    await api
      .post('/api/auth/register')
      .send({ username: 'مختبر التحقق', phone, password: 'secret123' })
      .expect(200);

    const verified = await api
      .post('/api/auth/verify')
      .send({ phone, code: DEV_CODE })
      .expect(200);

    expect(verified.body.data.token).toBeTruthy();
    expect(verified.body.data.user.phone).toBe(phone);

    // التوكن العائد صالح فعلاً على مسار محمي.
    const me = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${verified.body.data.token}`)
      .expect(200);
    expect(me.body.data.user.phone).toBe(phone);
  });

  it('a wrong code does not produce a session', async () => {
    const phone = `078${Math.floor(10000000 + Math.random() * 89999999)}`;
    await api
      .post('/api/auth/register')
      .send({ username: 'مختبر التحقق', phone, password: 'secret123' })
      .expect(200);

    const bad = await api.post('/api/auth/verify').send({ phone, code: '000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.data).toBeNull();
  });
});
