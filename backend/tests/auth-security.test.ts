import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { api, approveAsAdmin, purgeTestUsers, registerAndLogin } from './helpers.js';

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(import.meta.dirname, '..');

/** رقم فريد لكل حالة — الاختبارات تتشارك القاعدة فلا يجوز تصادم الأرقام. */
let counter = 0;
/**
 * رقم فريد **بالصيغة المعتمدة** `+9647XXXXXXXXX`.
 *
 * الأرقام تُخزَّن دولية الآن، وهذه السويت تستعلم القاعدة مباشرةً بالرقم
 * (رموز التحقق، حالة التوثيق). إعادةُ الصيغة المحلية كانت تجعل كل استعلام
 * يعود فارغاً — لا لأن السلوك خطأ بل لأن الاختبار يسأل عن تمثيل لم يعد
 * موجوداً. مسارات الإدخال المحلية (`07…`, `7…`, `00964…`) مغطّاة في
 * `tests/phone-normalization.test.ts`.
 */
function uniquePhone(prefix = '+96477') {
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

/**
 * بيئة إنتاج صالحة الأساس — كل حالة تكسر عنصراً واحداً منها.
 *
 * `APP_ENV` مذكورة صراحةً لأن العملية الأمّ قد تحمل قيمةً موروثة من ملف
 * `.env` المحلي، وهي ستطغى على الاشتقاق من `NODE_ENV` فتُفرغ فحصَ الإقلاع
 * من معناه.
 */
const VALID_PRODUCTION_ENV = {
  APP_ENV: 'prod',
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgres://user:pass@db.example.com:5432/otaku',
  // إعدادان بديلُهما يعمل ويعطي سلوكاً خاطئاً بصمت، فصارا مطلوبين صراحةً
  // خارج التطوير: `TRUST_PROXY` (بدونه ينهار حدّ المعدّل إلى دلو واحد خلف
  // الوسيط) و`PUBLIC_BASE_URL` (بدونه تُبنى روابط الصور على localhost).
  TRUST_PROXY: '1',
  PUBLIC_BASE_URL: 'https://api.example.com',
};

describe('تسجيل حساب جديد — المسار الحقيقي كاملاً (بلا رمز)', () => {
  beforeAll(async () => {
    await purgeTestUsers();
    await purgeTestUsers('078%');
  });
  afterAll(async () => {
    await purgeTestUsers();
    await purgeTestUsers('078%');
  });

  it('[CRITICAL] حساب جديد: تسجيل ← طلب معلَّق ← موافقة الإدارة ← دخول', async () => {
    const phone = uniquePhone();
    const register = await api
      .post('/api/auth/register')
      .send({ username: 'مختبر', phone, password: 'secret123', gender: 'male' })
      .expect(202);

    // لا توكن، لا رمز، لا كلمة مرور في الردّ.
    expect(register.body.data.token).toBeUndefined();
    expect(JSON.stringify(register.body)).not.toContain('secret123');
    expect(register.body.data.request.status).toBe('pending');

    // القاعدة: صفٌّ غير مفعَّل يحمل تجزئةً لا كلمةً، وطلبٌ معلَّق بلا كلمة.
    const { rows } = await db.query<{ password_hash: string; phone_verified_at: Date | null }>(
      'SELECT password_hash, phone_verified_at FROM users WHERE phone = $1',
      [phone],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.phone_verified_at).toBeNull();
    expect(rows[0]!.password_hash).not.toBe('secret123');
    expect(rows[0]!.password_hash.startsWith('$2')).toBe(true);
    const { rows: req } = await db.query<Record<string, unknown>>(
      `SELECT * FROM account_requests WHERE kind = 'registration' AND submitted_phone = $1`,
      [phone],
    );
    expect(req).toHaveLength(1);
    expect(JSON.stringify(req[0])).not.toContain('secret123');
    expect(Object.keys(req[0]!).some((k) => k.includes('password'))).toBe(false);

    await approveAsAdmin(register.body.data.request.id as string);

    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' }).expect(200);
    expect(login.body.data.user.isPhoneVerified).toBe(true);
    expect(login.body.data.token).toBeTruthy();
  });

  it('[CRITICAL] الحساب لا يصير مفعَّلاً إلا بموافقة الإدارة — والدخول ممنوع قبلها', async () => {
    const phone = uniquePhone();
    await api
      .post('/api/auth/register')
      .send({ username: 'مختبر', phone, password: 'secret123', gender: 'male' })
      .expect(202);

    const { rows } = await db.query<{ phone_verified_at: Date | null }>(
      'SELECT phone_verified_at FROM users WHERE phone = $1',
      [phone],
    );
    expect(rows[0]!.phone_verified_at).toBeNull();

    // كلمة مرور صحيحة + حساب غير مفعَّل = لا جلسة.
    const login = await api.post('/api/auth/login').send({ phone, password: 'secret123' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
    expect(login.body.data).toBeNull();
  });

  it('تسجيل مهجور يُستأنف بدل أن يحبس الرقم إلى الأبد', async () => {
    const phone = uniquePhone();
    await api
      .post('/api/auth/register')
      .send({ username: 'محاولة أولى', phone, password: 'first-pass', gender: 'male' })
      .expect(202);

    // الرقم نفسه ثانيةً ببيانات جديدة: يُقبل ويحدّث الصفّ والطلب المعلَّق.
    const second = await api
      .post('/api/auth/register')
      .send({ username: 'محاولة ثانية', phone, password: 'second-pass', gender: 'female' })
      .expect(202);

    const { rows } = await db.query<{ username: string; n: string }>(
      `SELECT u.username,
              (SELECT COUNT(*)::text FROM account_requests r
                WHERE r.kind = 'registration' AND r.submitted_phone = u.phone AND r.status = 'pending') AS n
         FROM users u WHERE u.phone = $1`,
      [phone],
    );
    expect(rows[0]!.username).toBe('محاولة ثانية');
    // طلبٌ معلَّق واحد لا اثنان.
    expect(rows[0]!.n).toBe('1');

    await approveAsAdmin(second.body.data.request.id as string);
    // كلمة المرور الأحدث هي النافذة.
    await api.post('/api/auth/login').send({ phone, password: 'first-pass' }).expect(401);
    await api.post('/api/auth/login').send({ phone, password: 'second-pass' }).expect(200);
  });

  it('الرقم المفعَّل مأخوذ فعلاً — لا تسجيل ثانٍ عليه', async () => {
    const { phone } = await registerAndLogin();
    const res = await api
      .post('/api/auth/register')
      .send({ username: 'منتحل', phone, password: 'other123', gender: 'male' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('بيانات دخول خاطئة مرفوضة بلا كشف أيّ الحقلين خطأ', async () => {
    const { phone } = await registerAndLogin();
    const wrongPassword = await api.post('/api/auth/login').send({ phone, password: 'wrong' });
    const wrongPhone = await api.post('/api/auth/login').send({ phone: uniquePhone(), password: 'secret123' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPhone.status).toBe(401);
    expect(wrongPassword.body.message).toBe(wrongPhone.body.message);
  });

  it('استعادة كلمة المرور لا تكشف وجود الرقم من عدمه', async () => {
    const { phone } = await registerAndLogin();
    const body = { username: 'مختبر', gender: 'male', levelKey: 'beginner' };
    const existing = await api.post('/api/auth/forgot-password').send({ ...body, phone });
    const missing = await api.post('/api/auth/forgot-password').send({ ...body, phone: uniquePhone() });
    expect(existing.status).toBe(missing.status);
    expect(existing.body.message).toBe(missing.body.message);
    expect(Object.keys(existing.body.data)).toEqual(Object.keys(missing.body.data));
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

  it('الإنتاج المضبوط كاملاً يقلع', async () => {
    const result = await runFixture('print-config.ts', VALID_PRODUCTION_ENV);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.isProduction).toBe(true);
    expect(parsed.jwtSecretLength).toBe(64);
  });

  it('التطوير يعمل ببديل موسوم لا يشبه سرّ إنتاج', async () => {
    const result = await runFixture('print-config.ts', {
      APP_ENV: undefined,
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
      DATABASE_URL: undefined,
        });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.isProduction).toBe(false);
    expect(parsed.jwtSecretLength).toBeGreaterThan(0);
  });
});

describe('الاختبار المسبق مشدَّد كالإنتاج', () => {
  const VALID_STAGING_ENV = {
    APP_ENV: 'staging',
    NODE_ENV: 'production',
    JWT_SECRET: 'b'.repeat(64),
    DATABASE_URL: 'postgres://user:pass@staging-db.example.com:5432/otaku_staging',
          TRUST_PROXY: '1',
    PUBLIC_BASE_URL: 'https://staging-api.example.com',
  };

  it('يسقط عند غياب JWT_SECRET', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_STAGING_ENV,
      JWT_SECRET: undefined,
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('JWT_SECRET');
  });

  it('يرفض مفتاحاً ضعيفاً', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_STAGING_ENV,
      JWT_SECRET: 'insecure_dev_secret_change_me',
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('JWT_SECRET');
  });

  it('يسقط عند غياب DATABASE_URL', async () => {
    const result = await runFixture('print-config.ts', {
      ...VALID_STAGING_ENV,
      DATABASE_URL: undefined,
    });
    expect(result.ok).toBe(false);
    expect((result as { stderr: string }).stderr).toContain('DATABASE_URL');
  });

  it('يقلع حين تكتمل أسراره', async () => {
    const result = await runFixture('print-config.ts', VALID_STAGING_ENV);
    expect(result.ok).toBe(true);
    const parsed = JSON.parse((result as { stdout: string }).stdout);
    expect(parsed.appEnv).toBe('staging');
    // ولا يشترك مع الإنتاج في وصلة القاعدة.
    expect(parsed.databaseUrl).toContain('staging');
  });
});

describe('إبطال التوكن عند إيقاف الحساب (S-8)', () => {
  afterAll(async () => {
    await purgeTestUsers();
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
    await purgeTestUsers();
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
  // منطق المسؤول انتقل إلى `scripts/seedAdmin.ts` (ليُختبر في العملية نفسها —
  // انظر `seed-admin.test.ts`)؛ الحراسة هنا تقرأ الملفّين معاً لأن الضمانات
  // تخصّ البذر كلّه لا ملفاً بعينه.
  async function seedSources() {
    const { readFile } = await import('node:fs/promises');
    const [seed, admin] = await Promise.all([
      readFile(path.join(BACKEND_ROOT, 'scripts', 'seed.ts'), 'utf8'),
      readFile(path.join(BACKEND_ROOT, 'scripts', 'seedAdmin.ts'), 'utf8'),
    ]);
    return { seed, admin, all: `${seed}\n${admin}` };
  }

  it('لا كلمة مرور افتراضية في سكربت البذر', async () => {
    const { all, seed } = await seedSources();

    // لا قيمة ثابتة تُخبز في الكود…
    expect(all).not.toMatch(/hash\(\s*['"]admin123['"]/);
    expect(all).not.toMatch(/password_hash.*['"]admin123['"]/);
    // …ولا طباعة لكلمة المرور في السجل.
    expect(all).not.toMatch(/console\.log\([^)]*\$\{?password\b/);
    expect(all).not.toMatch(/log\([^)]*\$\{?password\b/);
    // والإنشاء مشروط بمتغيّرات بيئة صريحة، ويستدعيه البذر فعلاً.
    expect(all).toContain('SEED_ADMIN_PHONE');
    expect(all).toContain('SEED_ADMIN_PASSWORD');
    expect(seed).toContain('await seedAdminUser(client)');
  });

  it('لا يُنشأ مسؤول ما لم تُضبط متغيّرات البيئة', async () => {
    const { admin, seed } = await seedSources();
    // الشرط الحارس موجود قبل أي إدراج لمسؤول.
    expect(admin).toMatch(/if \(!rawPhone \|\| !password\)/);
    expect(seed).toContain('ALLOW_PRODUCTION_SEED');
  });

  it('[CRITICAL] رقم المسؤول يمرّ من التوحيد المعتمد لا من تعبيرٍ محلي خاص', async () => {
    const { admin } = await seedSources();
    // كان `/^07\d{9}$/.test(phone)` يقبل الصيغة المحلية ثم يُدرجها كما هي
    // فيرتطم بقيد E.164. الفحص على الاستدعاء لا على ذِكر النمط في تعليق.
    expect(admin).toContain('normalizeIraqiPhone(rawPhone)');
    expect(admin).not.toMatch(/\/\^07\\d\{9\}\$\/\.test\(/);
  });
});
