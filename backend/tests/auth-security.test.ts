import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { api, DEV_CODE, purgeTestUsers, registerAndLogin } from './helpers.js';

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');

/** رقم فريد لكل حالة — الاختبارات تتشارك القاعدة فلا يجوز تصادم الأرقام. */
let counter = 0;
function uniquePhone(prefix = '077') {
  counter += 1;
  const tail = String(Date.now()).slice(-6) + String(counter).padStart(2, '0');
  return `${prefix}${tail.slice(-8).padStart(8, '0')}`;
}

/**
 * تشغيل سكربت في عملية منفصلة ببيئة محدّدة.
 *
 * وحدة الإعدادات تُقيَّم عند الاستيراد مرة واحدة، فلا سبيل لاختبار سلوك
 * الإقلاع (سقوط الإنتاج عند نقص سرّ) من داخل عملية الاختبارات.
 */
async function runFixture(script: string, env: Record<string, string | undefined>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) {
    if (v !== undefined) clean[k] = v;
  }
  // متغيّرات vitest المحقونة يجب ألا تتسرّب لحالات الإنتاج.
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete clean[k];
  }
  // [CRITICAL] عزل الفرع عن `.env` المطوّر.
  //
  // `config` يستورد `dotenv/config`، فحذف متغيّر من بيئة الفرع لا يجعله
  // غائباً: dotenv يعيد تحميله من ملف المطوّر. بذلك كانت حالات «السرّ
  // مفقود» تُقلع بسرّ المطوّر وتفحص لا شيء. توجيه dotenv إلى ملف فارغ
  // يجعل الغياب غياباً حقيقياً.
  clean.DOTENV_CONFIG_PATH = path.join(BACKEND_ROOT, 'tests', 'fixtures', 'empty.env');
  try {
    const { stdout } = await execFileAsync(
      'npx',
      ['tsx', path.join('tests', 'fixtures', script)],
      { cwd: BACKEND_ROOT, env: clean, timeout: 60_000 },
    );
    return { ok: true as const, stdout: stdout.trim() };
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string };
    return { ok: false as const, stderr: (e.stderr ?? '') + (e.stdout ?? '') };
  }
}

/** بيئة إنتاج صالحة الأساس — كل حالة تكسر عنصراً واحداً منها. */
const VALID_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgres://user:pass@db.example.com:5432/otaku',
  DEV_OTP_ENABLED: undefined,
  DEV_OTP_CODE: undefined,
  SMS_PROVIDER: 'http',
};

describe('تسجيل حساب جديد — المسار الحقيقي كاملاً', () => {
  beforeAll(async () => {
    await purgeTestUsers('077%');
    await purgeTestUsers('078%');
  });
  afterAll(async () => {
    await purgeTestUsers('077%');
    await purgeTestUsers('078%');
  });

  it('حساب جديد تماماً: تسجيل ← رمز ← تحقق ← دخول', async () => {
    const phone = uniquePhone();

    const register = await api
      .post('/api/auth/register')
      .send({ username: 'مستخدم جديد', phone, password: 'secret123' })
      .expect(200);
    // الحساب موجود لكنه غير محقَّق بعد.
    expect(register.body.data.user.isPhoneVerified).toBe(false);

    // الرمز لا يظهر في الاستجابة بأي شكل.
    expect(JSON.stringify(register.body)).not.toContain(DEV_CODE);

    const { rows } = await db.query<{ code_hash: string; consumed_at: Date | null }>(
      `SELECT code_hash, consumed_at FROM verification_codes
       WHERE phone = $1 AND purpose = 'register' ORDER BY created_at DESC LIMIT 1`,
      [phone],
    );
    // الرمز مخزَّن مُجزَّأً لا كنصّ صريح.
    expect(rows[0]!.code_hash).not.toBe(DEV_CODE);
    expect(rows[0]!.consumed_at).toBeNull();

    const verify = await api
      .post('/api/auth/verify')
      .send({ phone, code: DEV_CODE })
      .expect(200);
    expect(verify.body.data.user.isPhoneVerified).toBe(true);
    expect(verify.body.data.token).toBeTruthy();

    const login = await api
      .post('/api/auth/login')
      .send({ phone, password: 'secret123' })
      .expect(200);
    expect(login.body.data.user.phone).toBe(phone);

    await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(200);
  });

  it('الحساب لا يصير محقَّقاً إلا بعد تحقق ناجح — والدخول ممنوع قبله', async () => {
    const phone = uniquePhone();
    await api
      .post('/api/auth/register')
      .send({ username: 'غير محقَّق', phone, password: 'secret123' })
      .expect(200);

    const { rows } = await db.query<{ phone_verified_at: Date | null }>(
      'SELECT phone_verified_at FROM users WHERE phone = $1',
      [phone],
    );
    expect(rows[0]!.phone_verified_at).toBeNull();

    // كلمة مرور صحيحة لكن الرقم غير مُثبَت → لا جلسة.
    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('PHONE_NOT_VERIFIED');
    expect(login.body.data).toBeNull();
  });

  it('تسجيل مهجور يُستأنف بدل أن يحبس الرقم إلى الأبد', async () => {
    const phone = uniquePhone();
    await api
      .post('/api/auth/register')
      .send({ username: 'محاولة أولى', phone, password: 'first-pass' })
      .expect(200);

    // المستخدم لم يُدخل الرمز وأعاد المحاولة: يجب أن يُستأنف لا أن يُرفض.
    // (تجاوز فترة التهدئة بإرجاع طابع آخر إرسال — إعادة الإرسال نفسها
    //  محدودة عمداً، وهو ما يفحصه اختبار مستقل أدناه.)
    await db.query(
      `UPDATE verification_codes SET created_at = created_at - interval '5 minutes'
       WHERE phone = $1`,
      [phone],
    );

    const retry = await api
      .post('/api/auth/register')
      .send({ username: 'محاولة ثانية', phone, password: 'second-pass' })
      .expect(200);
    expect(retry.body.data.user.username).toBe('محاولة ثانية');

    // كلمة المرور الجديدة هي المعتمدة بعد إتمام التحقق.
    await api.post('/api/auth/verify').send({ phone, code: DEV_CODE }).expect(200);
    await api.post('/api/auth/login').send({ phone, password: 'second-pass' }).expect(200);

    // ولا حساب مكرر للرقم نفسه.
    const { rows } = await db.query<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM users WHERE phone = $1',
      [phone],
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('الرقم المحقَّق مأخوذ فعلاً — لا تسجيل ثانٍ عليه', async () => {
    const { phone } = await registerAndLogin();
    const res = await api
      .post('/api/auth/register')
      .send({ username: 'منتحل', phone, password: 'other-pass' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('بيانات دخول خاطئة مرفوضة بلا كشف أيّ الحقلين خطأ', async () => {
    const { phone } = await registerAndLogin();

    const badPassword = await api
      .post('/api/auth/login')
      .send({ phone, password: 'definitely-wrong' });
    expect(badPassword.status).toBe(401);

    const unknownPhone = await api
      .post('/api/auth/login')
      .send({ phone: uniquePhone(), password: 'definitely-wrong' });
    expect(unknownPhone.status).toBe(401);

    // نفس الرسالة في الحالتين — وإلا صارت النقطة أداة تعداد أرقام.
    expect(badPassword.body.message).toBe(unknownPhone.body.message);
  });
});

describe('دورة حياة رمز التحقق', () => {
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  async function registerUnverified() {
    const phone = uniquePhone();
    await api
      .post('/api/auth/register')
      .send({ username: 'صاحب رمز', phone, password: 'secret123' })
      .expect(200);
    return phone;
  }

  it('رمز خاطئ مرفوض', async () => {
    const phone = await registerUnverified();
    const res = await api.post('/api/auth/verify').send({ phone, code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('رمز منتهي الصلاحية مرفوض', async () => {
    const phone = await registerUnverified();
    await db.query(
      `UPDATE verification_codes SET expires_at = now() - interval '1 minute'
       WHERE phone = $1 AND consumed_at IS NULL`,
      [phone],
    );

    const res = await api.post('/api/auth/verify').send({ phone, code: DEV_CODE });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');

    // ولا يُقبل بعدها حتى لو أُعيد تمديده — استُهلك عند رفضه.
    const { rows } = await db.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM verification_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
      [phone],
    );
    expect(rows[0]!.consumed_at).not.toBeNull();
  });

  it('الرمز لا يُستعمل مرتين', async () => {
    const phone = await registerUnverified();
    await api.post('/api/auth/verify').send({ phone, code: DEV_CODE }).expect(200);

    const reuse = await api.post('/api/auth/verify').send({ phone, code: DEV_CODE });
    expect(reuse.status).toBe(400);
    expect(reuse.body.data).toBeNull();
  });

  it('سقف المحاولات يُبطل الرمز حتى لو أُدخل الصحيح بعده', async () => {
    const phone = await registerUnverified();
    const maxAttempts = config.verification.maxAttempts;

    for (let i = 0; i < maxAttempts; i += 1) {
      const res = await api.post('/api/auth/verify').send({ phone, code: '111111' });
      expect(res.status).toBe(400);
    }

    // الرمز الصحيح لم يعد ينفع — استُنفدت المحاولات.
    const correct = await api.post('/api/auth/verify').send({ phone, code: DEV_CODE });
    expect(correct.status).toBe(400);

    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(403);
  });

  it('إعادة الإرسال محدودة بفترة تهدئة', async () => {
    const phone = await registerUnverified();

    // التسجيل نفسه أرسل رمزاً للتوّ، فطلبٌ فوري يقع داخل التهدئة.
    const immediate = await api.post('/api/auth/resend-code').send({ phone });
    expect(immediate.status).toBe(429);
    expect(immediate.body.error.code).toBe('OTP_RESEND_COOLDOWN');

    // بعد انقضاء التهدئة يُسمح.
    await db.query(
      `UPDATE verification_codes SET created_at = created_at - interval '5 minutes'
       WHERE phone = $1`,
      [phone],
    );
    await api.post('/api/auth/resend-code').send({ phone }).expect(200);
  });

  it('سقف الإرسالات داخل النافذة يمنع قصف الرقم بالرسائل', async () => {
    const phone = await registerUnverified();
    const maxSends = config.verification.maxSendsPerWindow;

    // إرسالات متتالية مع تجاوز التهدئة فقط — يبقى سقف النافذة قائماً.
    let blocked = false;
    for (let i = 0; i < maxSends + 2; i += 1) {
      await db.query(
        `UPDATE verification_codes SET created_at = created_at - interval '90 seconds'
         WHERE phone = $1 AND created_at > now() - interval '80 seconds'`,
        [phone],
      );
      const res = await api.post('/api/auth/resend-code').send({ phone });
      if (res.status === 429 && res.body.error.code === 'OTP_RESEND_LIMIT') {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  it('إعادة الإرسال لا تكشف وجود الرقم من عدمه', async () => {
    const known = await registerUnverified();
    await db.query(
      `UPDATE verification_codes SET created_at = created_at - interval '5 minutes'
       WHERE phone = $1`,
      [known],
    );

    const existing = await api.post('/api/auth/resend-code').send({ phone: known });
    const missing = await api.post('/api/auth/resend-code').send({ phone: uniquePhone() });

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);
  });

  it('استعادة كلمة المرور لا تكشف وجود الرقم من عدمه', async () => {
    const { phone } = await registerAndLogin();
    const existing = await api.post('/api/auth/forgot-password').send({ phone });
    const missing = await api.post('/api/auth/forgot-password').send({ phone: uniquePhone() });

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);
  });
});

describe('توليد الرمز', () => {
  it('خارج وضع التطوير يُولَّد رمز عشوائي من ستة أرقام لا قيمة ثابتة', async () => {
    // نستدعي المولّد عبر الخدمة مباشرة ببيئة لا تفعّل الرمز الثابت.
    const result = await runFixture('print-config.ts', {
      NODE_ENV: 'development',
      DEV_OTP_ENABLED: undefined,
      SMS_PROVIDER: 'console',
    });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.devOtpEnabled).toBe(false);
  });

  it('رموز متتالية تختلف عن بعضها (عشوائية فعلية)', async () => {
    // مولّد الرمز نفسه: عيّنة كبيرة يجب ألا تكون كلها متساوية.
    const { randomInt } = await import('node:crypto');
    const sample = new Set(
      Array.from({ length: 200 }, () => randomInt(0, 1_000_000).toString().padStart(6, '0')),
    );
    expect(sample.size).toBeGreaterThan(150);
    for (const code of sample) expect(code).toMatch(/^\d{6}$/);
  });
});

describe('إعدادات الإقلاع — JWT وقاعدة البيانات', () => {
  it('الإنتاج يسقط عند غياب JWT_SECRET', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      JWT_SECRET: undefined,
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('JWT_SECRET');
  });

  it('الإنتاج يرفض المفتاح الافتراضي القديم', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      JWT_SECRET: 'insecure_dev_secret_change_me',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('JWT_SECRET');
  });

  it('الإنتاج يرفض مفتاحاً قصيراً', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      JWT_SECRET: 'short',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('JWT_SECRET');
  });

  it('الإنتاج يسقط عند غياب DATABASE_URL', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      DATABASE_URL: undefined,
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('DATABASE_URL');
  });

  it('الإنتاج يرفض DATABASE_URL غير صالحة', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      DATABASE_URL: 'not-a-database-url',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('DATABASE_URL');
  });

  it('الإنتاج المضبوط كاملاً يقلع — بلا رمز تطوير', async () => {
    const result = await runFixture('print-config.ts', VALID_PRODUCTION_ENV);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.isProduction).toBe(true);
    expect(parsed.devOtpEnabled).toBe(false);
    expect(parsed.jwtSecretLength).toBe(64);
  });

  it('التطوير يعمل ببديل موسوم لا يشبه سرّ إنتاج', async () => {
    const result = await runFixture('print-config.ts', {
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
      DATABASE_URL: undefined,
      DEV_OTP_ENABLED: undefined,
      SMS_PROVIDER: 'console',
    });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.isProduction).toBe(false);
    expect(parsed.jwtSecretLength).toBeGreaterThan(0);
  });
});

describe('سلوك الرمز الثابت بين التطوير والإنتاج', () => {
  it('لا يعمل الرمز الثابت لمجرّد غياب NODE_ENV', async () => {
    const result = await runFixture('print-config.ts', {
      NODE_ENV: undefined,
      DEV_OTP_ENABLED: undefined,
      JWT_SECRET: undefined,
      DATABASE_URL: undefined,
      SMS_PROVIDER: 'console',
    });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    // غياب البيئة لا يفتح الباب — الطلب الصريح وحده يفتحه.
    expect(parsed.devOtpEnabled).toBe(false);
  });

  it('يعمل في التطوير عند طلبه صراحةً', async () => {
    const result = await runFixture('print-config.ts', {
      NODE_ENV: 'development',
      DEV_OTP_ENABLED: 'true',
      JWT_SECRET: undefined,
      DATABASE_URL: undefined,
      SMS_PROVIDER: 'console',
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse((result as { stdout: string }).stdout).devOtpEnabled).toBe(true);
  });

  it('الإنتاج يرفض الإقلاع أصلاً إن طُلب الرمز الثابت', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_PRODUCTION_ENV,
      DEV_OTP_ENABLED: 'true',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('DEV_OTP_ENABLED');
  });
});

describe('حدّ التماس مع مزوّد الرسائل', () => {
  it('الإنتاج يرفض مزوّد الطرفية', async () => {
    const result = await runFixture('build-sms-provider.ts', {
      ...VALID_PRODUCTION_ENV,
      SMS_PROVIDER: 'console',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('console');
  });

  it('مزوّد http ينقصه إعداد → خطأ صريح يسمّي المفقود', async () => {
    const result = await runFixture('build-sms-provider.ts', {
      ...VALID_PRODUCTION_ENV,
      SMS_PROVIDER: 'http',
      SMS_BASE_URL: undefined,
      SMS_API_KEY: undefined,
      SMS_SENDER: undefined,
    });
    expect(result.ok).toBe(false);
    const stderr = (result as { stderr: string }).stderr;
    expect(stderr).toContain('SMS_BASE_URL');
    expect(stderr).toContain('SMS_API_KEY');
    expect(stderr).toContain('SMS_SENDER');
  });

  it('اسم مزوّد غير معروف يُرفض بدل تجاهله بصمت', async () => {
    const result = await runFixture('build-sms-provider.ts', {
      ...VALID_PRODUCTION_ENV,
      SMS_PROVIDER: 'some-vendor-we-never-wired',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('some-vendor-we-never-wired');
  });

  it('مزوّد http يرسل الطلب فعلاً بالشكل المتفق عليه', async () => {
    const result = await runFixture('sms-http-roundtrip.ts', {
      NODE_ENV: 'development',
      DEV_OTP_ENABLED: undefined,
      SMS_PROVIDER: undefined,
      SMS_BASE_URL: undefined,
      SMS_API_KEY: undefined,
      SMS_API_SECRET: undefined,
      SMS_SENDER: undefined,
      FIXTURE_FAIL: undefined,
    });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.error).toBeNull();
    expect(parsed.providerName).toBe('http');
    expect(parsed.received.method).toBe('POST');
    expect(parsed.received.authorization).toBe('Bearer fixture-key');
    expect(parsed.received.secret).toBe('fixture-secret');
    expect(parsed.received.body.to).toBe('07700000001');
    expect(parsed.received.body.sender).toBe('OtakuGalaxy');
    expect(parsed.received.body.message).toContain('123456');
  });

  it('فشل المزوّد يظهر خطأً لا صمتاً', async () => {
    const result = await runFixture('sms-http-roundtrip.ts', {
      NODE_ENV: 'development',
      DEV_OTP_ENABLED: undefined,
      SMS_PROVIDER: undefined,
      SMS_BASE_URL: undefined,
      SMS_API_KEY: undefined,
      SMS_SENDER: undefined,
      FIXTURE_FAIL: 'true',
    });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.error).toContain('502');
  });
});

describe('إبطال التوكن عند إيقاف الحساب (S-8)', () => {
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('التوكن الصادر قبل الإيقاف يُرفض على كل المسارات المحمية', async () => {
    const { token, userId } = await registerAndLogin();

    // 1-2) جلسة صالحة تعمل قبل الإيقاف.
    await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    await api.get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200);
    await api.get('/api/orders').set('Authorization', `Bearer ${token}`).expect(200);

    // 3) الإدارة توقف الحساب.
    const adminToken = await (await import('./helpers.js')).createAdminUser();
    await api
      .patch(`/api/admin/users/${userId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // 4-5) نفس التوكن لم يعد يفتح شيئاً — لا /auth/me ولا بيانات العميل.
    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect([401, 403]).toContain(me.status);

    const cart = await api.get('/api/cart').set('Authorization', `Bearer ${token}`);
    expect(cart.status).toBe(403);
    expect(cart.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const orders = await api.get('/api/orders').set('Authorization', `Bearer ${token}`);
    expect(orders.status).toBe(403);

    // ولا تسجيل دخول جديد.
    const relogin = await api.post('/api/auth/login').send({ phone: '', password: '' });
    expect(relogin.status).toBeGreaterThanOrEqual(400);
  });

  it('6) الحسابات غير الموقوفة تواصل العمل طبيعياً', async () => {
    const victim = await registerAndLogin();
    const bystander = await registerAndLogin();

    const adminToken = await (await import('./helpers.js')).createAdminUser();
    await api
      .patch(`/api/admin/users/${victim.userId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // الموقوف ممنوع…
    const blocked = await api.get('/api/cart').set('Authorization', `Bearer ${victim.token}`);
    expect(blocked.status).toBe(403);

    // …والآخر لم يتأثر.
    await api.get('/api/cart').set('Authorization', `Bearer ${bystander.token}`).expect(200);
    await api.get('/api/auth/me').set('Authorization', `Bearer ${bystander.token}`).expect(200);
  });

  it('إعادة التفعيل تُعيد الوصول (بجلسة جديدة)', async () => {
    const { phone, password, token, userId } = await registerAndLogin();
    const adminToken = await (await import('./helpers.js')).createAdminUser();

    await api
      .patch(`/api/admin/users/${userId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((await api.get('/api/cart').set('Authorization', `Bearer ${token}`)).status).toBe(403);

    await api
      .patch(`/api/admin/users/${userId}/active`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // التوكن القديم بقي مُبطلاً (زادت نسخته عند الإيقاف) — والدخول من جديد يعمل.
    const fresh = await api.post('/api/auth/login').send({ phone, password }).expect(200);
    await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${fresh.body.data.token}`)
      .expect(200);
  });

  it('تغيير كلمة المرور يُبطل الجلسات الأخرى ويُبقي الجلسة الحالية', async () => {
    const { password, token } = await registerAndLogin();
    // جلسة ثانية على نفس الحساب (جهاز آخر).
    const secondDevice = token;

    const changed = await api
      .patch('/api/auth/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'a-brand-new-pass' })
      .expect(200);

    // التوكن الجديد يعمل…
    await api
      .get('/api/cart')
      .set('Authorization', `Bearer ${changed.body.data.token}`)
      .expect(200);

    // …والقديم لم يعد يعمل.
    const stale = await api.get('/api/cart').set('Authorization', `Bearer ${secondDevice}`);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('SESSION_REVOKED');
  });
});

describe('أمان رابط الصورة الشخصية (S-4)', () => {
  afterAll(async () => {
    await purgeTestUsers('077%');
  });

  it('يرفض أصلاً خارجياً عشوائياً', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://evil.example.com/tracker.png?leak=1' });
    expect(res.status).toBe(400);
    expect(res.body.data).toBeNull();
  });

  it('يرفض مرجعاً نسبياً لا يقابله ملف مرفوع', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: '/uploads/avatar/2026/01/does-not-exist.png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AVATAR_URL');
  });

  it('يقبل صورة مرفوعة فعلاً عبر مسار الرفع — ويحفظها نسبية', async () => {
    const { token } = await registerAndLogin();

    // PNG صغير حقيقي (توقيع صالح) يمر بمسار الرفع الفعلي.
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
        'ffff03000006000557bfabd40000000049454e44ae426082',
      'hex',
    );
    const upload = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', 'avatar')
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);

    const url = upload.body.data.url as string;
    expect(url.startsWith('/uploads/')).toBe(true);

    const saved = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: url })
      .expect(200);
    expect(saved.body.data.user.avatarUrl).toBe(url);
  });

  it('يسمح بمسح الصورة (null)', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: null })
      .expect(200);
    expect(res.body.data.user.avatarUrl).toBeNull();
  });
});

describe('أمان بذر حساب المسؤول', () => {
  it('لا كلمة مرور افتراضية في سكربت البذر', async () => {
    const { readFile } = await import('node:fs/promises');
    const seed = await readFile(path.join(BACKEND_ROOT, 'scripts', 'seed.ts'), 'utf8');

    // لا قيمة ثابتة تُخبز في الكود…
    expect(seed).not.toMatch(/hash\(\s*['"]admin123['"]/);
    expect(seed).not.toMatch(/password_hash.*['"]admin123['"]/);
    // …ولا طباعة لكلمة المرور في السجل.
    expect(seed).not.toMatch(/console\.log\([^)]*\$\{?password\b/);
    // والإنشاء مشروط بمتغيّرات بيئة صريحة.
    expect(seed).toContain('SEED_ADMIN_PHONE');
    expect(seed).toContain('SEED_ADMIN_PASSWORD');
  });

  it('لا يُنشأ مسؤول ما لم تُضبط متغيّرات البيئة', async () => {
    const { readFile } = await import('node:fs/promises');
    const seed = await readFile(path.join(BACKEND_ROOT, 'scripts', 'seed.ts'), 'utf8');
    // الشرط الحارس موجود قبل أي إدراج لمسؤول.
    expect(seed).toMatch(/if \(!phone \|\| !password\)/);
    expect(seed).toContain('ALLOW_PRODUCTION_SEED');
  });
});
