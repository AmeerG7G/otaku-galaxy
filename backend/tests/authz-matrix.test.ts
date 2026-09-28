import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
  TEST_PASSWORD,
} from './helpers.js';

/**
 * مصفوفة التخويل — الفاعل × المورد × الفعل (تدقيق الأمان 2026-09-21).
 *
 * كل حالة هنا تحرس حاجزاً قائماً: المصادقة، دور المسؤول، ملكية المورد،
 * الهوية من الجلسة لا من الحمولة، وخلوّ الردود من الأسرار. الحالات كُتبت
 * لتسقط حين يُزال الحاجز (أُثبت ذلك بطفرات يدوية أثناء التدقيق)، لا لتوثّق
 * السلوك القائم فحسب.
 *
 * [CONTRACT] رموز الرفض من `PROJECT_FEATURE_SPEC.md` §4.2 وأخطاء `utils/errors.ts`:
 *   - بلا توكن / توكن فاسد / منتهٍ → 401
 *   - دور غير مسؤول على `/api/admin` → 403
 *   - طلبُ غيرك: `GET /orders/:id` → 403 (عمداً)، `confirm-receipt` → 404 (عمداً)
 *   - تقييمُ غيرك: `PATCH /reviews/:id` → 403؛ طلبٌ ليس لك في `POST /reviews` → 404
 *   - مجموعةُ غيرك / سطرُ عربةِ غيرك → 404؛ إشعارُ غيرك → لا أثر (200)
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** توكن موقَّع بمفتاح الخادم نفسه — لتزوير الحقول لا التوقيع. */
function signWith(payload: Record<string, unknown>, options: jwt.SignOptions = {}) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h', ...options });
}

const b64url = (value: string) => Buffer.from(value).toString('base64url');

/** توكن `alg: none` — بلا توقيع أصلاً. */
function unsignedToken(payload: Record<string, unknown>) {
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.`;
}

async function tokenVersionOf(userId: string) {
  const { rows } = await db.query<{ token_version: number }>(
    'SELECT token_version FROM users WHERE id = $1',
    [userId],
  );
  return rows[0]!.token_version;
}

/** مفاتيح لا يجوز أن تظهر في أي ردّ، بأي عمق. */
const SECRET_KEY_PATTERN = /^((current|new)?password(_?hash)?|hash|token_?version|jwt|secret)$/i;

function keysMatching(value: unknown, pattern: RegExp, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keysMatching(item, pattern, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
      const here = `${path}.${key}`;
      return [...(pattern.test(key) ? [here] : []), ...keysMatching(child, pattern, here)];
    });
  }
  return [];
}

/** تجزئة bcrypt في أي نصّ — `$2a$10$…`. */
const BCRYPT_PATTERN = /\$2[aby]\$\d{2}\$/;

function expectNoSecrets(body: unknown) {
  expect(keysMatching(body, SECRET_KEY_PATTERN)).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(BCRYPT_PATTERN);
}

function expectDenied(res: { status: number; body: any }, status: number, code?: string) {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(res.body.data).toBeNull();
  if (code) expect(res.body.error.code).toBe(code);
}

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٢ — حدود المصادقة
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2 — authentication boundary', () => {
  let user: Awaited<ReturnType<typeof registerAndLogin>>;

  beforeAll(async () => {
    user = await registerAndLogin();
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  const PROTECTED_READS: Array<[string, string]> = [
    ['get', '/api/auth/me'],
    ['get', '/api/cart'],
    ['get', '/api/orders'],
    ['get', '/api/orders/pending-confirmation'],
    ['get', '/api/favorites'],
    ['get', '/api/reviews'],
    ['get', '/api/points'],
    ['get', '/api/collections'],
    ['get', '/api/notifications'],
    ['get', '/api/notifications/prefs'],
    ['get', '/api/devices'],
    ['get', '/api/restock-subscriptions/mine'],
    ['get', '/api/birthday'],
  ];

  it.each(PROTECTED_READS)('%s %s → 401 without a token', async (method, path) => {
    const res = await (api as any)[method](path);
    expectDenied(res, 401, 'UNAUTHORIZED');
  });

  it.each(PROTECTED_READS)('%s %s → 401 with a malformed token', async (method, path) => {
    const res = await (api as any)[method](path).set(bearer('not.a.jwt'));
    expectDenied(res, 401, 'UNAUTHORIZED');
  });

  it('a non-Bearer Authorization scheme is not accepted', async () => {
    const res = await api.get('/api/cart').set('Authorization', `Basic ${user.token}`);
    expectDenied(res, 401);
    const bare = await api.get('/api/cart').set('Authorization', user.token);
    expectDenied(bare, 401);
  });

  it('an expired token is rejected', async () => {
    const tv = await tokenVersionOf(user.userId);
    const expired = signWith(
      { sub: user.userId, role: 'customer', phone: user.phone, tv },
      { expiresIn: '-10s' },
    );
    const res = await api.get('/api/cart').set(bearer(expired));
    expectDenied(res, 401, 'UNAUTHORIZED');
  });

  it('a token signed with a different secret is rejected', async () => {
    const tv = await tokenVersionOf(user.userId);
    const forged = jwt.sign(
      { sub: user.userId, role: 'admin', phone: user.phone, tv },
      'x'.repeat(64),
      { expiresIn: '1h' },
    );
    expectDenied(await api.get('/api/cart').set(bearer(forged)), 401);
    expectDenied(await api.get('/api/admin/users').set(bearer(forged)), 401);
  });

  it('[CRITICAL] an unsigned (alg: none) token is rejected', async () => {
    const tv = await tokenVersionOf(user.userId);
    const now = Math.floor(Date.now() / 1000);
    const none = unsignedToken({
      sub: user.userId,
      role: 'admin',
      phone: user.phone,
      tv,
      iat: now,
      exp: now + 3600,
    });
    expectDenied(await api.get('/api/cart').set(bearer(none)), 401);
    expectDenied(await api.get('/api/admin/users').set(bearer(none)), 401);
  });

  it('a validly signed token with a missing or non-string sub is rejected', async () => {
    const tv = await tokenVersionOf(user.userId);
    expectDenied(await api.get('/api/cart').set(bearer(signWith({ role: 'customer', tv }))), 401);
    expectDenied(
      await api.get('/api/cart').set(bearer(signWith({ sub: 12345, role: 'customer', tv }))),
      401,
    );
    // sub غير موجود في القاعدة أصلاً — 401 لا 500.
    expectDenied(
      await api.get('/api/cart').set(bearer(signWith({ sub: randomUUID(), role: 'customer', tv: 0 }))),
      401,
    );
    // sub ليس UUID — يجب أن يفشل مغلقاً لا أن يسقط في خطأ قاعدة (500).
    expectDenied(
      await api.get('/api/cart').set(bearer(signWith({ sub: 'not-a-uuid', role: 'customer', tv: 0 }))),
      401,
    );
  });

  it('a validly signed token without a role claim is rejected', async () => {
    const tv = await tokenVersionOf(user.userId);
    expectDenied(await api.get('/api/cart').set(bearer(signWith({ sub: user.userId, tv }))), 401);
  });

  it('a validly signed token with a stale token version is rejected (SESSION_REVOKED)', async () => {
    const tv = await tokenVersionOf(user.userId);
    const stale = signWith({ sub: user.userId, role: 'customer', phone: user.phone, tv: tv - 1 });
    expectDenied(await api.get('/api/cart').set(bearer(stale)), 401, 'SESSION_REVOKED');
    const future = signWith({ sub: user.userId, role: 'customer', phone: user.phone, tv: tv + 1 });
    expectDenied(await api.get('/api/cart').set(bearer(future)), 401, 'SESSION_REVOKED');
  });

  it('[CRITICAL] the role claim inside the token is not trusted — the row decides', async () => {
    const tv = await tokenVersionOf(user.userId);
    // توقيع صحيح، لكنّ الحمولة تدّعي `admin` والصفّ يقول `customer`.
    const escalated = signWith({ sub: user.userId, role: 'admin', phone: user.phone, tv });
    expectDenied(await api.get('/api/admin/users').set(bearer(escalated)), 403, 'FORBIDDEN');
    // ويبقى صالحاً كزبون — فالتوقيع والنسخة سليمان.
    await api.get('/api/cart').set(bearer(escalated)).expect(200);
  });

  it('a token for a deleted account is rejected, not served', async () => {
    const ghost = await registerAndLogin();
    await purgeTestUsers(ghost.phone);
    expectDenied(await api.get('/api/cart').set(bearer(ghost.token)), 401);
    expectDenied(await api.get('/api/auth/me').set(bearer(ghost.token)), 401);
  });

  it('an anonymous mutation on a protected route has no side effect', async () => {
    const before = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM orders');
    expectDenied(
      await api.post('/api/orders').send({ governorateId: randomUUID(), fullAddress: 'x'.repeat(10), phone: '07711111111' }),
      401,
    );
    const after = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM orders');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);

    const beforeCol = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM collections');
    expectDenied(await api.post('/api/collections').send({ name: 'anon' }), 401);
    const afterCol = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM collections');
    expect(afterCol.rows[0]!.n).toBe(beforeCol.rows[0]!.n);
  });

  it('the public catalogue ignores a broken token instead of rejecting the visitor', async () => {
    await api.get('/api/catalog/home').set(bearer('garbage')).expect(200);
    const expired = signWith({ sub: user.userId, role: 'customer', tv: 0 }, { expiresIn: '-10s' });
    await api.get('/api/catalog/categories').set(bearer(expired)).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٣ — التصعيد الرأسي: كل مسار إداري × (زائر → 401، زبون → 403)
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 3 — vertical privilege escalation (every admin endpoint)', () => {
  let customer: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let orderId: string;
  let pendingRequestId: string;
  let pendingUserId: string;
  const U = randomUUID();

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    customer = await registerAndLogin();

    await api
      .post('/api/cart')
      .set(bearer(customer.token))
      .send({ productId: catalog.productIds[0], quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(customer.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07744444444' })
      .expect(201);
    orderId = order.body.data.id;

    // طلب تسجيل معلَّق لزبون آخر — هدفٌ للموافقة/الرفض غير المصرَّح بهما.
    const pendingPhone = `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const registered = await api
      .post('/api/auth/register')
      .send({ username: 'معلَّق', phone: pendingPhone, password: TEST_PASSWORD, gender: 'male' })
      .expect(202);
    pendingRequestId = registered.body.data.request.id;
    pendingUserId = registered.body.data.user.id;
  });

  afterAll(async () => {
    await purgeTestUsers();
  });

  /** كل مسار إداري في `routes/admin.ts` — مع جسمٍ صالح شكلاً حيث يلزم. */
  const ADMIN_ENDPOINTS: Array<[string, () => string, unknown?]> = [
    ['get', () => '/api/admin/products'],
    ['post', () => '/api/admin/products', { name: 'x', price: 1000, categoryId: U, stock: 1 }],
    ['patch', () => `/api/admin/products/${U}`, { name: 'x' }],
    ['delete', () => `/api/admin/products/${U}`],
    ['get', () => '/api/admin/categories'],
    ['post', () => '/api/admin/categories', { name: 'x', imageUrl: '/uploads/x.png' }],
    ['patch', () => `/api/admin/categories/${U}`, { name: 'x' }],
    ['delete', () => `/api/admin/categories/${U}`],
    ['post', () => '/api/admin/subcategories', { categoryId: U, name: 'x' }],
    ['patch', () => `/api/admin/subcategories/${U}`, { name: 'x' }],
    ['delete', () => `/api/admin/subcategories/${U}`],
    ['get', () => '/api/admin/banners'],
    ['post', () => '/api/admin/banners', { imageUrl: '/uploads/x.png' }],
    ['patch', () => `/api/admin/banners/${U}`, { isActive: false }],
    ['delete', () => `/api/admin/banners/${U}`],
    ['get', () => '/api/admin/restock/demand'],
    ['get', () => '/api/admin/governorates'],
    ['post', () => '/api/admin/governorates', { name: 'x', deliveryFee: 1000 }],
    ['patch', () => `/api/admin/governorates/${U}`, { deliveryFee: 1000 }],
    ['delete', () => `/api/admin/governorates/${U}`],
    ['get', () => '/api/admin/orders'],
    ['get', () => `/api/admin/orders/${orderId}`],
    ['patch', () => `/api/admin/orders/${orderId}/status`, { status: 'CONFIRMED' }],
    ['patch', () => `/api/admin/orders/${orderId}/reminder`, { delayHours: 1 }],
    ['post', () => `/api/admin/orders/${orderId}/reminder/send-now`],
    ['get', () => '/api/admin/users'],
    ['get', () => '/api/admin/points/summary'],
    ['get', () => `/api/admin/customers/${customer.userId}/points`],
    ['get', () => '/api/admin/galaxy-points/rules'],
    ['get', () => '/api/admin/loyalty-rewards'],
    ['post', () => `/api/admin/loyalty-rewards/${U}/fulfil`],
    ['get', () => '/api/admin/notifications/stats'],
    ['get', () => '/api/admin/notifications'],
    ['get', () => '/api/admin/customers/birthdays'],
    ['patch', () => `/api/admin/users/${customer.userId}/active`],
    ['get', () => `/api/admin/customers/${customer.userId}`],
    ['patch', () => `/api/admin/customers/${customer.userId}/password`, { newPassword: 'hijacked-pass-1' }],
    ['get', () => '/api/admin/account-requests'],
    ['get', () => `/api/admin/account-requests/${pendingRequestId}`],
    ['post', () => `/api/admin/account-requests/${pendingRequestId}/approve`],
    ['post', () => `/api/admin/account-requests/${pendingRequestId}/reject`, { note: 'x' }],
    ['get', () => '/api/admin/stats'],
    ['get', () => '/api/admin/reviews'],
    ['patch', () => `/api/admin/reviews/${U}/moderate`, { status: 'approved' }],
    ['get', () => '/api/admin/franchises'],
    ['post', () => '/api/admin/franchises', { name: 'x' }],
    ['patch', () => `/api/admin/franchises/${U}`, { name: 'x' }],
    ['delete', () => `/api/admin/franchises/${U}`],
    ['get', () => `/api/admin/products/${U}/franchises`],
    ['get', () => '/api/admin/zones'],
    ['get', () => `/api/admin/governorates/${U}/zones`],
    ['post', () => '/api/admin/zones', { governorateId: U, name: 'x', deliveryFee: 1000 }],
    ['patch', () => `/api/admin/zones/${U}`, { deliveryFee: 1000 }],
    ['delete', () => `/api/admin/zones/${U}`],
    ['get', () => '/api/admin/settings'],
    ['patch', () => '/api/admin/settings', { social_tiktok: 'https://example.com' }],
    ['get', () => '/api/admin/settings/app-version'],
    ['patch', () => '/api/admin/settings/app-version', { minimumSupportedVersion: '1.0.0' }],
    ['post', () => '/api/admin/notifications', { userId: U, title: 'x', body: 'x' }],
    ['post', () => '/api/admin/notifications/broadcast', { audience: { type: 'all' }, title: 'x', body: 'x' }],
    ['post', () => '/api/admin/notifications/audience', { audience: { type: 'all' } }],
    ['post', () => '/api/admin/uploads'],
  ];

  it.each(ADMIN_ENDPOINTS)('%s %s → 401 anonymous / 403 customer', async (method, path, body) => {
    const anon = await (api as any)[method](path()).send(body);
    expectDenied(anon, 401, 'UNAUTHORIZED');

    const asCustomer = await (api as any)[method](path()).set(bearer(customer.token)).send(body);
    expectDenied(asCustomer, 403, 'FORBIDDEN');
    // لا كشف: الرسالة عامّة، ولا تفاصيل عن المورد.
    expect(Object.keys(asCustomer.body.error)).toEqual(['code']);
  });

  it('the admin route table above is complete — every route in routes/admin.ts is covered', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');
    const declared = [...source.matchAll(/adminRoutes\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    const covered = new Set(
      ADMIN_ENDPOINTS.map(([method, path]) =>
        `${method} ${path()
          .replace('/api/admin', '')
          .replace(new RegExp(`/${U}`, 'g'), '/:id')
          .replace(`/${orderId}`, '/:id')
          .replace(`/${customer.userId}`, '/:id')
          .replace(`/${pendingRequestId}`, '/:id')}`,
      ),
    );
    const missing = declared.filter((route) => {
      // `:governorateId` و`:id` كلاهما معرّف في المسار.
      const normalized = route.replace(':governorateId', ':id');
      return !covered.has(normalized);
    });
    expect(missing).toEqual([]);
  });

  it('[CRITICAL] a customer attempt leaves admin-owned state untouched', async () => {
    // حالة الطلب
    expectDenied(await api.patch(`/api/admin/orders/${orderId}/status`).set(bearer(customer.token)).send({ status: 'COMPLETED' }), 403, 'FORBIDDEN');
    const order = await db.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(order.rows[0]!.status).toBe('PENDING_ADMIN_CONFIRMATION');

    // تفعيل الحساب المعلَّق
    expectDenied(await api.post(`/api/admin/account-requests/${pendingRequestId}/approve`).set(bearer(customer.token)), 403, 'FORBIDDEN');
    const request = await db.query<{ status: string }>('SELECT status FROM account_requests WHERE id = $1', [pendingRequestId]);
    expect(request.rows[0]!.status).toBe('pending');
    const pendingUser = await db.query<{ phone_verified_at: Date | null }>('SELECT phone_verified_at FROM users WHERE id = $1', [pendingUserId]);
    expect(pendingUser.rows[0]!.phone_verified_at).toBeNull();

    // كلمة مرور زبون آخر
    expectDenied(await api.patch(`/api/admin/customers/${pendingUserId}/password`).set(bearer(customer.token)).send({ newPassword: 'hijacked-pass-2' }), 403, 'FORBIDDEN');
    const hash = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [pendingUserId]);
    const bcrypt = (await import('bcryptjs')).default;
    expect(await bcrypt.compare(TEST_PASSWORD, hash.rows[0]!.password_hash)).toBe(true);

    // إيقاف حسابه/حساب غيره
    expectDenied(await api.patch(`/api/admin/users/${pendingUserId}/active`).set(bearer(customer.token)), 403, 'FORBIDDEN');
    const active = await db.query<{ is_active: boolean }>('SELECT is_active FROM users WHERE id = $1', [pendingUserId]);
    expect(active.rows[0]!.is_active).toBe(true);

    // إنشاء منتج
    const before = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM products');
    expectDenied(await api.post('/api/admin/products').set(bearer(customer.token)).send({ name: 'x', price: 1000, categoryId: catalog.categoryId, subcategoryId: catalog.subcategoryId, stock: 1 }), 403, 'FORBIDDEN');
    const after = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM products');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('the same calls succeed for a real admin (the deny is about role, not the route being dead)', async () => {
    await api.get('/api/admin/users').set(bearer(adminToken)).expect(200);
    await api.get(`/api/admin/orders/${orderId}`).set(bearer(adminToken)).expect(200);
    await api.get(`/api/admin/account-requests/${pendingRequestId}`).set(bearer(adminToken)).expect(200);
  });

  it('a customer cannot upload under any admin-only purpose', async () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
      'hex',
    );
    // (`slot` لم يعد غرض رفعٍ أصلاً — الهجرة 065؛ يحرسه `visual-slots-retired.test.ts`.)
    for (const purpose of ['product', 'banner', 'category', 'franchise']) {
      const res = await api
        .post('/api/uploads')
        .set(bearer(customer.token))
        .field('purpose', purpose)
        .attach('file', png, { filename: 'x.png', contentType: 'image/png' });
      expectDenied(res, 403, 'FORBIDDEN');
    }
    const stored = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM media_files WHERE uploaded_by = $1 AND purpose NOT IN ('review', 'avatar')`,
      [customer.userId],
    );
    expect(stored.rows[0]!.n).toBe('0');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٤ — التصعيد الأفقي (IDOR): «أ» يملك، و«ب» يحاول بمعرّفات «أ»
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 4 — horizontal privilege escalation (IDOR) across every user-owned resource', () => {
  let A: Awaited<ReturnType<typeof registerAndLogin>>;
  let B: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let outOfStockProductId: string;

  // ما يملكه «أ»
  let aOrderId: string;
  let aReviewId: string;
  let aCollectionId: string;
  let aNotificationId: string;
  const aDeviceToken = `device-token-A-${randomUUID()}`;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    A = await registerAndLogin();
    B = await registerAndLogin();

    // منتج نافد — لاشتراك «أخبرني عند توفره».
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
       VALUES ($1, 'نافد', 5000, $2, $3, 0)
       ON CONFLICT DO NOTHING RETURNING id`,
      ['منتج نافد للتدقيق', catalog.categoryId, catalog.subcategoryId],
    );
    outOfStockProductId =
      rows[0]?.id ??
      (await db.query<{ id: string }>('SELECT id FROM products WHERE name = $1', ['منتج نافد للتدقيق'])).rows[0]!.id;

    // «أ»: سطر عربة يبقى (المنتج الثاني)، وطلب من المنتج الأول.
    await api.post('/api/cart').set(bearer(A.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(A.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07744444444' })
      .expect(201);
    aOrderId = order.body.data.id;

    // الطلب يُستلم ← تقييم ← يُرفض (ليصير قابلاً لإعادة الإرسال).
    await api.patch(`/api/admin/orders/${aOrderId}/status`).set(bearer(adminToken)).send({ status: 'OUT_FOR_DELIVERY' }).expect(200);
    await api.post(`/api/orders/${aOrderId}/confirm-receipt`).set(bearer(A.token)).expect(200);
    const review = await api
      .post('/api/reviews')
      .set(bearer(A.token))
      .send({ orderId: aOrderId, productId: catalog.productIds[0], rating: 5, comment: 'ممتاز' })
      .expect(201);
    aReviewId = review.body.data.id;
    await api
      .patch(`/api/admin/reviews/${aReviewId}/moderate`)
      .set(bearer(adminToken))
      .send({ status: 'rejected', rejectionReason: 'للتدقيق' })
      .expect(200);

    const collection = await api.post('/api/collections').set(bearer(A.token)).send({ name: 'مجموعة أ' }).expect(201);
    aCollectionId = collection.body.data.id;
    await api.post(`/api/collections/${aCollectionId}/products`).set(bearer(A.token)).send({ productId: catalog.productIds[2] }).expect(200);

    // إشعارات «أ» — من انتقالات الطلب أعلاه.
    const notifications = await api.get('/api/notifications').set(bearer(A.token)).expect(200);
    aNotificationId = notifications.body.data.items[0].id;
    expect(aNotificationId).toBeTruthy();

    await api.post('/api/restock-subscriptions').set(bearer(A.token)).send({ productId: outOfStockProductId }).expect(200);
    await api.post('/api/devices').set(bearer(A.token)).send({ token: aDeviceToken, platform: 'android' }).expect(200);
  });

  afterAll(async () => {
    await db.query('DELETE FROM products WHERE name = $1', ['منتج نافد للتدقيق']);
    await purgeTestUsers();
  });

  // ── الطلبات ──

  it('[CRITICAL] B cannot read A\'s order (403 per contract) — admin can', async () => {
    expectDenied(await api.get(`/api/orders/${aOrderId}`).set(bearer(B.token)), 403, 'FORBIDDEN');
    await api.get(`/api/orders/${aOrderId}`).set(bearer(A.token)).expect(200);
    await api.get(`/api/admin/orders/${aOrderId}`).set(bearer(adminToken)).expect(200);
  });

  it('B\'s order list, pending-confirmation and status counts contain nothing of A\'s', async () => {
    const list = await api.get('/api/orders').set(bearer(B.token)).expect(200);
    expect(list.body.data.items).toEqual([]);
    expect(Object.values(list.body.data.statusCounts as Record<string, number>).every((n) => n === 0)).toBe(true);
    const pending = await api.get('/api/orders/pending-confirmation').set(bearer(B.token)).expect(200);
    expect(pending.body.data).toBeNull();
  });

  it('[CRITICAL] B cannot confirm receipt of A\'s order (404 per contract) and the status is untouched', async () => {
    // طلبٌ ثانٍ لـ«أ» في حالة الخروج للتوصيل.
    await api.post('/api/cart').set(bearer(A.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const second = await api
      .post('/api/orders')
      .set(bearer(A.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، المنصور', phone: '07744444444' })
      .expect(201);
    await api.patch(`/api/admin/orders/${second.body.data.id}/status`).set(bearer(adminToken)).send({ status: 'OUT_FOR_DELIVERY' }).expect(200);

    expectDenied(await api.post(`/api/orders/${second.body.data.id}/confirm-receipt`).set(bearer(B.token)), 404, 'NOT_FOUND');
    const status = await db.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [second.body.data.id]);
    expect(status.rows[0]!.status).toBe('OUT_FOR_DELIVERY');
  });

  // ── التقييمات ──

  it('[CRITICAL] B cannot submit a review against A\'s order (404), and nothing is written', async () => {
    const before = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM reviews WHERE user_id = $1', [B.userId]);
    expectDenied(
      await api.post('/api/reviews').set(bearer(B.token)).send({ orderId: aOrderId, productId: catalog.productIds[0], rating: 1, comment: 'انتحال' }),
      404,
      'NOT_FOUND',
    );
    const after = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM reviews WHERE user_id = $1', [B.userId]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('[CRITICAL] B cannot resubmit A\'s rejected review (403) and A\'s review is untouched', async () => {
    expectDenied(
      await api.patch(`/api/reviews/${aReviewId}`).set(bearer(B.token)).send({ rating: 1, comment: 'مزوَّر' }),
      403,
      'FORBIDDEN',
    );
    const row = await db.query<{ rating: number; comment: string; status: string }>('SELECT rating, comment, status FROM reviews WHERE id = $1', [aReviewId]);
    expect(row.rows[0]).toMatchObject({ rating: 5, comment: 'ممتاز', status: 'rejected' });
  });

  it('B\'s review list and /reviews/find never return A\'s review', async () => {
    const mine = await api.get('/api/reviews').set(bearer(B.token)).expect(200);
    expect(JSON.stringify(mine.body)).not.toContain(aReviewId);
    const found = await api
      .get('/api/reviews/find')
      .query({ orderId: aOrderId, productId: catalog.productIds[0] })
      .set(bearer(B.token))
      .expect(200);
    expect(found.body.data).toBeNull();
  });

  // ── العربة ──

  it('[CRITICAL] B cannot update or delete A\'s cart line (404) and A\'s line is untouched', async () => {
    // السطر يُنشأ هنا لا في التهيئة: أي دفعٍ لاحق لـ«أ» يفرغ عربته بنفسه.
    const cart = await api.post('/api/cart').set(bearer(A.token)).send({ productId: catalog.productIds[1], quantity: 2 }).expect(200);
    const aCartItemId = cart.body.data.item.id as string;
    expectDenied(await api.patch(`/api/cart/${aCartItemId}`).set(bearer(B.token)).send({ quantity: 9 }), 404, 'NOT_FOUND');
    expectDenied(await api.delete(`/api/cart/${aCartItemId}`).set(bearer(B.token)), 404, 'NOT_FOUND');
    const line = await db.query<{ quantity: number }>('SELECT quantity FROM cart_items WHERE id = $1', [aCartItemId]);
    expect(line.rows).toHaveLength(1);
    expect(line.rows[0]!.quantity).toBe(2);
    const bCart = await api.get('/api/cart').set(bearer(B.token)).expect(200);
    expect(bCart.body.data.items).toEqual([]);
  });

  // ── المجموعات ──

  it('[CRITICAL] B cannot rename, delete, or edit the products of A\'s collection (404) — untouched', async () => {
    expectDenied(await api.patch(`/api/collections/${aCollectionId}`).set(bearer(B.token)).send({ name: 'مسروقة' }), 404, 'NOT_FOUND');
    expectDenied(await api.post(`/api/collections/${aCollectionId}/products`).set(bearer(B.token)).send({ productId: catalog.productIds[0] }), 404, 'NOT_FOUND');
    expectDenied(await api.delete(`/api/collections/${aCollectionId}/products/${catalog.productIds[2]}`).set(bearer(B.token)), 404, 'NOT_FOUND');
    expectDenied(await api.delete(`/api/collections/${aCollectionId}`).set(bearer(B.token)), 404, 'NOT_FOUND');

    const col = await db.query<{ name: string }>('SELECT name FROM collections WHERE id = $1', [aCollectionId]);
    expect(col.rows[0]!.name).toBe('مجموعة أ');
    const items = await db.query<{ product_id: string }>('SELECT product_id FROM collection_products WHERE collection_id = $1', [aCollectionId]);
    expect(items.rows.map((r) => r.product_id)).toEqual([catalog.productIds[2]]);
    const bList = await api.get('/api/collections').set(bearer(B.token)).expect(200);
    expect(JSON.stringify(bList.body)).not.toContain(aCollectionId);
  });

  // ── الإشعارات ──

  it('B marking A\'s notification read is a no-op (documented) — A\'s stays unread and B never sees it', async () => {
    await api.post(`/api/notifications/${aNotificationId}/read`).set(bearer(B.token)).expect(200);
    const row = await db.query<{ read_at: Date | null; user_id: string }>('SELECT read_at, user_id FROM notifications WHERE id = $1', [aNotificationId]);
    expect(row.rows[0]!.user_id).toBe(A.userId);
    expect(row.rows[0]!.read_at).toBeNull();
    const bList = await api.get('/api/notifications').set(bearer(B.token)).expect(200);
    expect(JSON.stringify(bList.body)).not.toContain(aNotificationId);
  });

  it('B\'s read-all does not touch A\'s notifications', async () => {
    await api.post('/api/notifications/read-all').set(bearer(B.token)).expect(200);
    const unread = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [A.userId]);
    expect(Number(unread.rows[0]!.n)).toBeGreaterThan(0);
  });

  // ── «أخبرني عند توفره» ──

  it('B unsubscribing the same product does not remove A\'s subscription', async () => {
    const res = await api.delete(`/api/restock-subscriptions/${outOfStockProductId}`).set(bearer(B.token));
    expect([200, 404]).toContain(res.status);
    const aSubs = await api.get('/api/restock-subscriptions/mine').set(bearer(A.token)).expect(200);
    expect(JSON.stringify(aSubs.body)).toContain(outOfStockProductId);
  });

  // ── أجهزة الإشعارات ──

  it('B cannot unregister A\'s device token, and cannot list A\'s devices', async () => {
    await api.post('/api/devices/unregister').set(bearer(B.token)).send({ token: aDeviceToken });
    const row = await db.query<{ is_active: boolean; user_id: string }>('SELECT is_active, user_id FROM device_tokens WHERE token = $1', [aDeviceToken]);
    expect(row.rows[0]).toMatchObject({ is_active: true, user_id: A.userId });
    const bDevices = await api.get('/api/devices').set(bearer(B.token)).expect(200);
    expect(bDevices.body.data).toEqual([]);
  });

  // ── الصورة الشخصية ──

  it('[CRITICAL] B cannot adopt A\'s uploaded photo as their avatar', async () => {
    const aPhoto = await registerUploadedPhoto(A.userId);
    expectDenied(await api.patch('/api/auth/me').set(bearer(B.token)).send({ avatarUrl: aPhoto }), 400, 'INVALID_AVATAR_URL');
    const row = await db.query<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id = $1', [B.userId]);
    expect(row.rows[0]!.avatar_url).toBeNull();
  });

  it('[CRITICAL] B cannot attach A\'s uploaded photo to B\'s own review', async () => {
    // طلبٌ مكتمل لـ«ب» ليملك حقّ التقييم.
    await api.post('/api/cart').set(bearer(B.token)).send({ productId: catalog.productIds[1], quantity: 1 }).expect(200);
    const bOrder = await api
      .post('/api/orders')
      .set(bearer(B.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، زيونة', phone: '07744444444' })
      .expect(201);
    await api.patch(`/api/admin/orders/${bOrder.body.data.id}/status`).set(bearer(adminToken)).send({ status: 'OUT_FOR_DELIVERY' }).expect(200);
    await api.post(`/api/orders/${bOrder.body.data.id}/confirm-receipt`).set(bearer(B.token)).expect(200);

    const aPhoto = await registerUploadedPhoto(A.userId);
    const res = await api
      .post('/api/reviews')
      .set(bearer(B.token))
      .send({ orderId: bOrder.body.data.id, productId: catalog.productIds[1], rating: 4, comment: 'x', photoUrls: [aPhoto] });
    expect(res.status).toBe(400);
    const stored = await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM reviews WHERE user_id = $1', [B.userId]);
    expect(stored.rows[0]!.n).toBe('0');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٥ — الهوية من الجلسة لا من الحمولة
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 5 — client-supplied identity is ignored', () => {
  let A: Awaited<ReturnType<typeof registerAndLogin>>;
  let B: Awaited<ReturnType<typeof registerAndLogin>>;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let aOrderId: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    A = await registerAndLogin();
    B = await registerAndLogin();
    await api.post('/api/cart').set(bearer(A.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(A.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07744444444' })
      .expect(201);
    aOrderId = order.body.data.id;
    await api.post('/api/collections').set(bearer(A.token)).send({ name: 'خاصّة بأ' }).expect(201);
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  const IDENTITY_KEYS = ['userId', 'user_id', 'customerId', 'ownerId', 'accountId', 'createdBy', 'sub'];

  it.each(['/api/orders', '/api/cart', '/api/collections', '/api/notifications', '/api/reviews', '/api/points', '/api/favorites'])(
    'GET %s with ?userId=A (and friends) still returns B\'s own data',
    async (path) => {
      for (const key of IDENTITY_KEYS) {
        const res = await api.get(path).query({ [key]: A.userId }).set(bearer(B.token)).expect(200);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain(aOrderId);
        expect(text).not.toContain(A.userId);
        expect(text).not.toContain(A.phone);
      }
    },
  );

  it('[CRITICAL] POST /api/orders with userId/customerId/status/total in the body creates the caller\'s order with server values', async () => {
    await api.post('/api/cart').set(bearer(B.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const res = await api
      .post('/api/orders')
      .set(bearer(B.token))
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07744444444',
        userId: A.userId,
        customerId: A.userId,
        user_id: A.userId,
        status: 'COMPLETED',
        total: 1,
        productsTotal: 1,
        deliveryFee: 0,
        discount: 999999,
        items: [{ productId: catalog.productIds[1], quantity: 100, price: 1 }],
      })
      .expect(201);
    const row = await db.query<{ user_id: string; status: string; total: string; products_total: string; discount: string }>(
      'SELECT user_id, status, total, products_total, discount FROM orders WHERE id = $1',
      [res.body.data.id],
    );
    expect(row.rows[0]!.user_id).toBe(B.userId);
    expect(row.rows[0]!.status).toBe('PENDING_ADMIN_CONFIRMATION');
    expect(Number(row.rows[0]!.products_total)).toBe(15000);
    expect(Number(row.rows[0]!.discount)).toBe(0);
    expect(Number(row.rows[0]!.total)).toBe(15000 + 4000);
    const items = await db.query<{ product_id: string; quantity: number }>('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [res.body.data.id]);
    expect(items.rows).toEqual([{ product_id: catalog.productIds[0], quantity: 1 }]);
  });

  it('POST /api/collections and /api/reviews ignore an injected userId', async () => {
    const col = await api.post('/api/collections').set(bearer(B.token)).send({ name: 'مزوَّرة', userId: A.userId, user_id: A.userId }).expect(201);
    const row = await db.query<{ user_id: string }>('SELECT user_id FROM collections WHERE id = $1', [col.body.data.id]);
    expect(row.rows[0]!.user_id).toBe(B.userId);
  });

  it('PATCH /api/auth/me cannot change role, phone, isActive, verification or token version', async () => {
    const before = await db.query<Record<string, unknown>>('SELECT role, phone, is_active, phone_verified_at, token_version FROM users WHERE id = $1', [B.userId]);
    const res = await api
      .patch('/api/auth/me')
      .set(bearer(B.token))
      .send({
        username: 'اسم جديد',
        role: 'admin',
        phone: '07799999999',
        isActive: false,
        is_active: false,
        phoneVerifiedAt: null,
        tokenVersion: 99,
        token_version: 99,
        id: A.userId,
      })
      .expect(200);
    expect(res.body.data.user.role).toBe('customer');
    const after = await db.query<Record<string, unknown>>('SELECT role, phone, is_active, phone_verified_at, token_version FROM users WHERE id = $1', [B.userId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
    expectDenied(await api.get('/api/admin/users').set(bearer(B.token)), 403);
  });

  it('no customer controller reads an identity from the request body or query (static guard)', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const dir = new URL('../src/controllers/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && !f.startsWith('admin'));
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(new URL(file, dir), 'utf8');
      // `req.auth!.id` هو المصدر الوحيد للهوية؛ أي `req.body.userId` ونحوه ممنوع.
      const matches = source.match(/req\.(body|query|params)\.(userId|user_id|customerId|ownerId|accountId|createdBy)\b/g);
      if (matches) offenders.push(`${file}: ${matches.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٦ — لا أسرار في أي ردّ
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 6 — sensitive field exposure', () => {
  let A: Awaited<ReturnType<typeof registerAndLogin>>;
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let aOrderId: string;
  let pendingRequestId: string;
  let resetRequestId: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    A = await registerAndLogin();
    await api.post('/api/cart').set(bearer(A.token)).send({ productId: catalog.productIds[0], quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(bearer(A.token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07744444444' })
      .expect(201);
    aOrderId = order.body.data.id;
    await api.patch(`/api/admin/orders/${aOrderId}/status`).set(bearer(adminToken)).send({ status: 'OUT_FOR_DELIVERY' }).expect(200);
    await api.post(`/api/orders/${aOrderId}/confirm-receipt`).set(bearer(A.token)).expect(200);
    const review = await api
      .post('/api/reviews')
      .set(bearer(A.token))
      .send({ orderId: aOrderId, productId: catalog.productIds[0], rating: 5, comment: 'ممتاز' })
      .expect(201);
    await api.patch(`/api/admin/reviews/${review.body.data.id}/moderate`).set(bearer(adminToken)).send({ status: 'approved' }).expect(200);

    const pendingPhone = `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const registered = await api
      .post('/api/auth/register')
      .send({ username: 'معلَّق', phone: pendingPhone, password: TEST_PASSWORD, gender: 'male' })
      .expect(202);
    pendingRequestId = registered.body.data.request.id;
    const reset = await api
      .post('/api/auth/forgot-password')
      .send({ phone: A.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' })
      .expect(202);
    resetRequestId = reset.body.data.request.id;
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  it('public auth responses (register, login, forgot-password, me) carry no hash, no token version', async () => {
    const phone = `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const register = await api.post('/api/auth/register').send({ username: 'مختبر', phone, password: TEST_PASSWORD, gender: 'male' }).expect(202);
    expectNoSecrets(register.body);
    expect(register.body.data.token).toBeUndefined();
    const login = await api.post('/api/auth/login').send({ phone: A.phone, password: A.password }).expect(200);
    // التوكن نفسه مسموح — لكن لا شيء غيره تحت مفتاحٍ حسّاس.
    const { token: _token, ...rest } = login.body.data;
    expectNoSecrets(rest);
    expect(keysMatching(login.body.data.user, /token/i)).toEqual([]);
    const me = await api.get('/api/auth/me').set(bearer(A.token)).expect(200);
    expectNoSecrets(me.body);
    const forgot = await api.post('/api/auth/forgot-password').send({ phone: A.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    expectNoSecrets(forgot.body);
    expect(Object.keys(forgot.body.data)).toEqual(['request']);
    expect(Object.keys(forgot.body.data.request).sort()).toEqual(['createdAt', 'id', 'status']);
  });

  it('the JWT payload carries only sub, role, phone, tv, iat, exp', async () => {
    const decoded = jwt.decode(A.token) as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'phone', 'role', 'sub', 'tv']);
    expect(JSON.stringify(decoded)).not.toMatch(BCRYPT_PATTERN);
  });

  it.each([
    ['/api/admin/users'],
    ['/api/admin/customers/birthdays'],
    ['/api/admin/account-requests'],
    ['/api/admin/orders'],
    ['/api/admin/reviews'],
    ['/api/admin/stats'],
    ['/api/admin/loyalty-rewards'],
    ['/api/admin/notifications'],
  ])('admin %s never exposes password hashes or token versions', async (path) => {
    const res = await api.get(path).set(bearer(adminToken)).expect(200);
    expectNoSecrets(res.body);
  });

  it('admin customer detail, points, order detail and account-request detail carry no secrets', async () => {
    for (const path of [
      `/api/admin/customers/${A.userId}`,
      `/api/admin/customers/${A.userId}/points`,
      `/api/admin/orders/${aOrderId}`,
      `/api/admin/account-requests/${pendingRequestId}`,
      `/api/admin/account-requests/${resetRequestId}`,
    ]) {
      const res = await api.get(path).set(bearer(adminToken)).expect(200);
      expectNoSecrets(res.body);
    }
  });

  it('approving / rejecting / setting a password returns no secret and never the password itself', async () => {
    const approve = await api.post(`/api/admin/account-requests/${pendingRequestId}/approve`).set(bearer(adminToken)).expect(200);
    expectNoSecrets(approve.body);
    // زبونٌ آخر: وضع كلمة مرور لـ«أ» يُبطل توكنه الذي تحتاجه الحالات التالية.
    const other = await registerAndLogin();
    const otherReset = await api
      .post('/api/auth/forgot-password')
      .send({ phone: other.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' })
      .expect(202);
    const set = await api
      .patch(`/api/admin/customers/${other.userId}/password`)
      .set(bearer(adminToken))
      .send({ newPassword: 'brand-new-secret-42', requestId: otherReset.body.data.request.id })
      .expect(200);
    expectNoSecrets(set.body);
    expect(JSON.stringify(set.body)).not.toContain('brand-new-secret-42');
    expect(Object.keys(set.body.data).sort()).toEqual(['customerId', 'request']);
  });

  it('a customer\'s own order omits admin-side identities (who changed the status)', async () => {
    const res = await api.get(`/api/orders/${aOrderId}`).set(bearer(A.token)).expect(200);
    expect(keysMatching(res.body, /changedBy|changed_by|resolvedBy|adminId/i)).toEqual([]);
    expect(res.body.data.statusHistory.length).toBeGreaterThan(0);
  });

  it('public product reviews and community photos expose no phone, user id, or order id', async () => {
    const reviews = await api.get(`/api/catalog/products/${catalog.productIds[0]}/reviews`).expect(200);
    const text = JSON.stringify(reviews.body);
    expect(text).toContain('ممتاز');
    expect(text).not.toContain(A.phone);
    expect(text).not.toContain(A.userId);
    expect(keysMatching(reviews.body, /^(userId|user_id|phone)$/)).toEqual([]);
    const photos = await api.get('/api/catalog/community/photos').expect(200);
    expect(JSON.stringify(photos.body)).not.toContain(A.phone);
    expect(JSON.stringify(photos.body)).not.toContain(A.userId);
  });

  it('public catalogue and settings responses carry no secrets or internal configuration', async () => {
    for (const path of ['/api/catalog/home', '/api/catalog/settings', '/api/catalog/app-version', '/api/catalog/loyalty-levels']) {
      const res = await api.get(path).expect(200);
      expectNoSecrets(res.body);
      expect(JSON.stringify(res.body)).not.toContain(config.jwtSecret);
      expect(JSON.stringify(res.body)).not.toContain('postgres://');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ٧ و٨ — التسجيل والموافقة، ونسيان كلمة المرور
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 7/8 — registration approval and admin-mediated reset', () => {
  let adminToken: string;
  beforeAll(async () => {
    adminToken = await createAdminUser();
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  const freshPhone = () => `077${Math.floor(10000000 + Math.random() * 89999999)}`;

  it('[CRITICAL] register cannot pre-verify, pre-activate, or self-promote via extra fields', async () => {
    const phone = freshPhone();
    const res = await api
      .post('/api/auth/register')
      .send({
        username: 'طامع',
        phone,
        password: TEST_PASSWORD,
        gender: 'male',
        role: 'admin',
        isActive: true,
        phoneVerifiedAt: new Date().toISOString(),
        phone_verified_at: new Date().toISOString(),
        isPhoneVerified: true,
        tokenVersion: 0,
      })
      .expect(202);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.isPhoneVerified).toBe(false);
    const row = await db.query<{ role: string; phone_verified_at: Date | null }>('SELECT role, phone_verified_at FROM users WHERE id = $1', [res.body.data.user.id]);
    expect(row.rows[0]).toEqual({ role: 'customer', phone_verified_at: null });
    expectDenied(await api.post('/api/auth/login').send({ phone, password: TEST_PASSWORD }), 403, 'ACCOUNT_PENDING_APPROVAL');
  });

  it('rejected → approve is refused (409) and the account stays locked; approved → reject is refused and stays open', async () => {
    const phone = freshPhone();
    const r = await api.post('/api/auth/register').send({ username: 'مرفوض', phone, password: TEST_PASSWORD, gender: 'male' }).expect(202);
    const requestId = r.body.data.request.id as string;
    await api.post(`/api/admin/account-requests/${requestId}/reject`).set(bearer(adminToken)).send({ note: 'لا' }).expect(200);
    expectDenied(await api.post(`/api/admin/account-requests/${requestId}/approve`).set(bearer(adminToken)), 409, 'REQUEST_RESOLVED');
    expectDenied(await api.post(`/api/admin/account-requests/${requestId}/reject`).set(bearer(adminToken)).send({ note: 'x' }), 409, 'REQUEST_RESOLVED');
    expectDenied(await api.post('/api/auth/login').send({ phone, password: TEST_PASSWORD }), 403, 'ACCOUNT_REQUEST_REJECTED');

    const phone2 = freshPhone();
    const r2 = await api.post('/api/auth/register').send({ username: 'مقبول', phone: phone2, password: TEST_PASSWORD, gender: 'male' }).expect(202);
    const requestId2 = r2.body.data.request.id as string;
    await api.post(`/api/admin/account-requests/${requestId2}/approve`).set(bearer(adminToken)).expect(200);
    expectDenied(await api.post(`/api/admin/account-requests/${requestId2}/reject`).set(bearer(adminToken)).send({ note: 'x' }), 409, 'REQUEST_RESOLVED');
    expectDenied(await api.post(`/api/admin/account-requests/${requestId2}/approve`).set(bearer(adminToken)), 409, 'REQUEST_RESOLVED');
    await api.post('/api/auth/login').send({ phone: phone2, password: TEST_PASSWORD }).expect(200);
  });

  it('[CRITICAL] forgot-password never authenticates the requester nor changes the victim\'s password', async () => {
    const victim = await registerAndLogin();
    const res = await api
      .post('/api/auth/forgot-password')
      .send({ phone: victim.phone, username: 'مهاجم', gender: 'female', levelKey: 'beginner', password: 'attacker-pass', newPassword: 'attacker-pass' })
      .expect(202);
    expect(res.body.data.token).toBeUndefined();
    expect(keysMatching(res.body, /token/i)).toEqual([]);
    // كلمة الضحية القديمة ما زالت النافذة، والجديدة المزعومة لا تفتح شيئاً.
    await api.post('/api/auth/login').send({ phone: victim.phone, password: victim.password }).expect(200);
    expectDenied(await api.post('/api/auth/login').send({ phone: victim.phone, password: 'attacker-pass' }), 401);
    // ولا يزال توكنه الحالي صالحاً — الطلب لا يبطل الجلسات.
    await api.get('/api/cart').set(bearer(victim.token)).expect(200);
  });

  it('a pending reset request for A cannot be used to set B\'s password (REQUEST_ACCOUNT_MISMATCH) — B untouched', async () => {
    const A = await registerAndLogin();
    const B = await registerAndLogin();
    const req = await api.post('/api/auth/forgot-password').send({ phone: A.phone, username: 'مختبر', gender: 'male', levelKey: 'beginner' }).expect(202);
    expectDenied(
      await api.patch(`/api/admin/customers/${B.userId}/password`).set(bearer(adminToken)).send({ newPassword: 'cross-set-99', requestId: req.body.data.request.id }),
      400,
      'REQUEST_ACCOUNT_MISMATCH',
    );
    await api.post('/api/auth/login').send({ phone: B.phone, password: B.password }).expect(200);
    const row = await db.query<{ status: string }>('SELECT status FROM account_requests WHERE id = $1', [req.body.data.request.id]);
    expect(row.rows[0]!.status).toBe('pending');
  });

  it('an admin-set password invalidates every prior session of that customer', async () => {
    const c = await registerAndLogin();
    await api.get('/api/cart').set(bearer(c.token)).expect(200);
    await api.patch(`/api/admin/customers/${c.userId}/password`).set(bearer(adminToken)).send({ newPassword: 'reset-by-admin-7' }).expect(200);
    expectDenied(await api.get('/api/cart').set(bearer(c.token)), 401, 'SESSION_REVOKED');
    expectDenied(await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }), 401);
    await api.post('/api/auth/login').send({ phone: c.phone, password: 'reset-by-admin-7' }).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ١٠ — الوسائط والملفات الثابتة
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 10 — media and static file boundary', () => {
  let adminToken: string;
  beforeAll(async () => {
    adminToken = await createAdminUser();
  });
  afterAll(async () => {
    await purgeTestUsers();
  });

  it.each([
    '/uploads/../package.json',
    '/uploads/../.env',
    '/uploads/..%2fpackage.json',
    '/uploads/%2e%2e/package.json',
    '/uploads/review/../../package.json',
    '/uploads/..%5cpackage.json',
  ])('[CRITICAL] static serving refuses %s', async (path) => {
    const res = await api.get(path);
    expect(res.status).not.toBe(200);
    expect(res.text ?? '').not.toContain('"name": "otaku-galaxy-api"');
    expect(res.text ?? '').not.toContain('JWT_SECRET');
  });

  it('upload purpose cannot be used as a path — only enum values are accepted', async () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
      'hex',
    );
    for (const purpose of ['../etc', 'review/../../x', 'slot/../product', '']) {
      const res = await api
        .post('/api/admin/uploads')
        .set(bearer(adminToken))
        .field('purpose', purpose)
        .attach('file', png, { filename: 'x.png', contentType: 'image/png' });
      if (purpose === '') {
        // الغياب يعني `review` افتراضاً — والفارغ قيمة غير مقبولة في الـenum.
        expect([201, 400]).toContain(res.status);
        if (res.status === 201) expect(res.body.data.url).toMatch(/^\/uploads\/review\//);
      } else {
        expect(res.status).toBe(400);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// المرحلة ١١ و١٢ — الفشل مغلقاً، ولا كشف في الأخطاء
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 11/12 — fail-closed behaviour and error disclosure', () => {
  afterAll(async () => {
    await purgeTestUsers();
  });

  it('an unknown path under /api/admin is 401 anonymous and 403 for a customer — the surface is not enumerable', async () => {
    expectDenied(await api.get('/api/admin/does-not-exist'), 401);
    const c = await registerAndLogin();
    expectDenied(await api.get('/api/admin/does-not-exist').set(bearer(c.token)), 403);
    expectDenied(await api.post('/api/admin/does-not-exist').set(bearer(c.token)).send({}), 403);
  });

  it('a suspended customer is refused on every protected surface including admin paths and uploads', async () => {
    const c = await registerAndLogin();
    const adminToken = await createAdminUser();
    await api.patch(`/api/admin/users/${c.userId}/active`).set(bearer(adminToken)).expect(200);
    expectDenied(await api.get('/api/cart').set(bearer(c.token)), 403, 'ACCOUNT_SUSPENDED');
    expectDenied(await api.post('/api/collections').set(bearer(c.token)).send({ name: 'x' }), 403, 'ACCOUNT_SUSPENDED');
    expectDenied(await api.get('/api/admin/users').set(bearer(c.token)), 403);
    expectDenied(await api.post('/api/uploads').set(bearer(c.token)).field('purpose', 'review'), 403);
    // والكتالوج العام يخدمه زائراً بلا خطأ.
    await api.get('/api/catalog/home').set(bearer(c.token)).expect(200);
  });

  it('validation and auth errors never echo internals (no stack, SQL, paths, or env)', async () => {
    const c = await registerAndLogin();
    const samples = [
      await api.get('/api/orders/not-a-uuid').set(bearer(c.token)),
      await api.post('/api/orders').set(bearer(c.token)).send({ governorateId: 'x' }),
      await api.get('/api/cart').set(bearer('x.y.z')),
      await api.get('/api/admin/users').set(bearer(c.token)),
      await api.post('/api/auth/login').send({ phone: 'bad', password: '' }),
      await api.get(`/api/orders/${randomUUID()}`).set(bearer(c.token)),
    ];
    for (const res of samples) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/\bat \w+ \(|node_modules|\/home\/|\.ts:\d+|SELECT |INSERT |postgres|pg-pool|JWT_SECRET|DATABASE_URL/i);
      expect(Object.keys(res.body).sort()).toEqual(['data', 'error', 'message', 'success']);
    }
  });
});
