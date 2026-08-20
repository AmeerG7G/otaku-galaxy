import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, purgeTestUsers, registerAndLogin } from './helpers.js';

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
});