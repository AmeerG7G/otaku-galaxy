import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * سقف محاولات حذف الحساب (STEP 78) — بالحساب، ٥ في الساعة.
 *
 * الحدود معطّلة في بقية السويت؛ هذا الملف يطلبها صراحةً قبل تحميل الإعدادات
 * (النمط نفسه في `rate-limits.test.ts`)، بسقفٍ عام واسع كي لا يسبقه.
 */
vi.hoisted(() => {
  const saved = { ...process.env };
  Object.assign(process.env, { RATE_LIMIT_ENFORCE_IN_TESTS: '1', RATE_LIMIT_GLOBAL_MAX: '1000' });
  (globalThis as { __deletionSavedEnv?: NodeJS.ProcessEnv }).__deletionSavedEnv = saved;
});

import { api, registerAndLogin } from './helpers.js';

afterAll(() => {
  const saved = (globalThis as { __deletionSavedEnv?: NodeJS.ProcessEnv }).__deletionSavedEnv ?? {};
  for (const name of ['RATE_LIMIT_ENFORCE_IN_TESTS', 'RATE_LIMIT_GLOBAL_MAX']) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('[SECURITY] حذف الحساب ليس باب تخمينٍ لكلمة المرور', () => {
  it('خمس محاولات خاطئة ثم 429 — حتى بكلمة المرور الصحيحة', async () => {
    const user = await registerAndLogin();
    const auth = { Authorization: `Bearer ${user.token}` };
    for (let i = 0; i < 5; i += 1) {
      const res = await api.post('/api/auth/me/delete').set(auth).send({ password: `wrong-${i}` });
      expect(res.status).toBe(400);
    }
    const blocked = await api.post('/api/auth/me/delete').set(auth).send({ password: user.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('ACCOUNT_DELETION_RATE_LIMITED');
    // الحساب باقٍ.
    await api.get('/api/auth/me').set(auth).expect(200);
  });
});
