import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { ADMIN_SECTIONS, type AdminSection } from '../src/domain/adminPermissions.js';
import {
  api,
  createAdminUser,
  createSubAdmin,
  purgeSubAdmins,
  purgeTestUsers,
  registerAndLogin,
} from './helpers.js';

/**
 * صلاحيات الأقسام — حارس المصدر ومصفوفة التشغيل (STEP 64).
 *
 * [SECURITY] ثلاث طبقات، كلٌّ منها تسقط حيث تسقط الأخرى صامتة:
 *   ١. **حارس المصدر**: كل `adminRoutes.<verb>(` في `routes/admin.ts` يحمل
 *      حارساً صريحاً بعد المسار مباشرةً — مسارٌ جديد بلا حارس يسقط هنا ولو
 *      لم يكتب أحدٌ له اختباراً.
 *   ٢. **الخريطة المثبَّتة**: الحارس المقروء من المصدر يطابق `EXPECTED`
 *      حرفياً. توسيع صلاحية مسارٍ (قسمٌ إضافي يقرأ الطلبات مثلاً) قرارٌ يُكتب
 *      هنا، لا سطرٌ يمرّ في مراجعة.
 *   ٣. **التشغيل**: لكل مسار — فرعيٌّ بلا صلاحيات يُرفض، وفرعيٌّ يملك كل قسمٍ
 *      مذكور يعبر الحارس، والأعلى يعبر دائماً، وما هو للأعلى وحده يُرفض
 *      لفرعيٍّ يملك الأقسام كلها.
 *
 * الطلبات تحمل معرّفاً عشوائياً وجسماً فارغاً: ما يعبر الحارس ينتهي عند
 * التحقق (٤٠٠) أو «غير موجود» (٤٠٤) — فلا يغيّر هذا الملف شيئاً في القاعدة.
 */

type Guard = 'any' | 'super' | AdminSection[];

const EXPECTED: Record<string, Guard> = {
  'get /me': 'any',
  'patch /me': ['admins'],
  'get /admins': 'super',
  'post /admins': 'super',
  'patch /admins/:id': 'super',
  'delete /admins/:id': 'super',
  'get /audit': 'super',
  'get /push/status': 'any',
  'post /devices': 'any',
  'post /devices/unregister': 'any',
  'get /notification-prefs': 'any',
  'patch /notification-prefs': 'any',
  'get /products': ['products', 'offers', 'banners'],
  'post /products': ['products'],
  'patch /products/:id': ['products'],
  'delete /products/:id': ['products'],
  'patch /offers/:id': ['offers', 'products'],
  'get /categories': ['categories', 'products', 'banners'],
  'post /categories': ['categories'],
  'patch /categories/:id': ['categories'],
  'delete /categories/:id': ['categories'],
  'post /subcategories': ['categories'],
  'patch /subcategories/:id': ['categories'],
  'delete /subcategories/:id': ['categories'],
  'get /banners': ['banners'],
  'post /banners': ['banners'],
  'patch /banners/:id': ['banners'],
  'delete /banners/:id': ['banners'],
  'get /restock/demand': ['restock'],
  'patch /restock/:id/schedule': ['restock', 'products'],
  'get /governorates': ['delivery'],
  'post /governorates': ['delivery'],
  'patch /governorates/:id': ['delivery'],
  'delete /governorates/:id': ['delivery'],
  'get /orders': ['orders', 'dashboard', 'notifications'],
  'get /orders/:id': ['orders'],
  'patch /orders/:id/status': ['orders'],
  'patch /orders/:id/reminder': ['orders', 'notifications'],
  'post /orders/:id/reminder/send-now': ['orders', 'notifications'],
  'get /users': ['customers', 'notifications'],
  'get /points/summary': ['points'],
  'get /customers/:id/points': ['points', 'customers'],
  'get /galaxy-points/rules': ['points'],
  'get /loyalty-rewards': ['points'],
  'post /loyalty-rewards/:id/fulfil': ['points'],
  'get /notifications/stats': ['notifications'],
  'get /notifications': ['notifications'],
  'get /customers/birthdays': ['birthdays'],
  'patch /users/:id/active': ['customers'],
  'get /customers/:id': ['customers'],
  'patch /customers/:id/password': ['customers', 'account_requests'],
  'get /account-requests': ['account_requests'],
  'get /account-requests/:id': ['account_requests'],
  'post /account-requests/:id/approve': ['account_requests'],
  'post /account-requests/:id/reject': ['account_requests'],
  'get /stats': ['dashboard'],
  'get /reviews': ['reviews'],
  'patch /reviews/:id/moderate': ['reviews'],
  'get /franchises': ['franchises', 'products'],
  'post /franchises': ['franchises'],
  'get /franchises/:id/usage': ['franchises'],
  'patch /franchises/:id': ['franchises'],
  'delete /franchises/:id': ['franchises'],
  'get /products/:id/franchises': ['products', 'franchises'],
  'get /zones': ['delivery'],
  'get /governorates/:governorateId/zones': ['delivery'],
  'post /zones': ['delivery'],
  'patch /zones/:id': ['delivery'],
  'delete /zones/:id': ['delivery'],
  'get /settings': ['settings'],
  'patch /settings': ['settings'],
  'get /settings/app-version': ['settings'],
  'patch /settings/app-version': ['settings'],
  'post /notifications': ['notifications'],
  'post /notifications/broadcast': ['notifications'],
  'post /notifications/audience': ['notifications'],
  'post /uploads': ['products', 'banners'],
};

async function routesSource() {
  return readFile(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');
}

/** الحارس المقروء من المصدر لكل مسار — `null` إن غاب. */
function parseGuards(source: string): Map<string, Guard | null> {
  const guards = new Map<string, Guard | null>();
  const calls = /adminRoutes\.(get|post|patch|put|delete)\(\s*'([^']+)',\s*([^\n]*)/g;
  for (const m of source.matchAll(calls)) {
    const key = `${m[1]} ${m[2]}`;
    const rest = m[3] ?? '';
    let guard: Guard | null = null;
    const can = /^can\(([^)]*)\)/.exec(rest);
    if (can) {
      guard = [...can[1]!.matchAll(/'([a-z_]+)'/g)].map((s) => s[1] as AdminSection);
    } else if (rest.startsWith('requireSuperAdmin')) {
      guard = 'super';
    } else if (rest.startsWith('requireAnyAdmin')) {
      guard = 'any';
    }
    guards.set(key, guard);
  }
  return guards;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function pathFor(route: string) {
  const [, path] = route.split(' ') as [string, string];
  return `/api/admin${path.replace(/:[a-zA-Z]+/g, randomUUID())}`;
}

async function call(route: string, token: string) {
  const method = route.split(' ')[0]!;
  return (api as any)[method](pathFor(route)).set(bearer(token)).send({});
}

describe('admin permissions — source guard and pinned map', () => {
  it('[SECURITY] every admin route carries an explicit guard right after its path', async () => {
    const source = await routesSource();
    const all = [...source.matchAll(/adminRoutes\.(get|post|patch|put|delete)\(/g)].length;
    const guards = parseGuards(source);
    const unguarded = [...guards].filter(([, guard]) => guard === null).map(([route]) => route);
    expect(unguarded).toEqual([]);
    expect(guards.size).toBe(all);
  });

  it('[SECURITY] the guard of every route matches the pinned map exactly', async () => {
    const parsed = Object.fromEntries(parseGuards(await routesSource()));
    expect(parsed).toEqual(EXPECTED);
  });

  it('sections are one list: domain, migration 068 CHECK, and dashboard types', async () => {
    const migration = await readFile(
      new URL('../src/database/migrations/068_admin_hierarchy_and_audit.sql', import.meta.url),
      'utf8',
    );
    const check = /admin_permissions <@ ARRAY\[([\s\S]*?)\]::TEXT\[\]/.exec(migration)?.[1] ?? '';
    const fromSql = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(fromSql).toEqual([...ADMIN_SECTIONS]);

    const dashboard = await readFile(
      new URL('../../admin/src/types/adminPermissions.ts', import.meta.url),
      'utf8',
    );
    const list = /ADMIN_SECTIONS = \[([\s\S]*?)\] as const/.exec(dashboard)?.[1] ?? '';
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...ADMIN_SECTIONS]);
  });
});

describe('admin permissions — enforced at runtime on every route', () => {
  let superToken: string;
  let none: string;
  let everything: string;

  beforeAll(async () => {
    superToken = await createAdminUser();
    none = (await createSubAdmin([], { suffix: 11 })).token;
    everything = (await createSubAdmin([...ADMIN_SECTIONS], { suffix: 12 })).token;
  });

  afterAll(async () => {
    await purgeSubAdmins();
  });

  const routes = Object.entries(EXPECTED);

  it.each(routes)('%s — no-permission sub-admin', async (route, guard) => {
    const res = await call(route, none);
    if (guard === 'any') {
      expect(res.status).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
      // الرفض لا يكشف القسم المطلوب ولا ما يملكه المسؤول.
      expect(Object.keys(res.body.error)).toEqual(['code']);
    }
  });

  it.each(routes.filter(([, guard]) => Array.isArray(guard)))(
    '%s — a sub-admin holding exactly one allowed section passes the guard',
    async (route, guard) => {
      for (const [i, section] of (guard as AdminSection[]).entries()) {
        const { token } = await createSubAdmin([section], { suffix: 20 + i });
        const res = await call(route, token);
        expect(res.status, `${route} with [${section}]`).not.toBe(403);
        expect(res.status).not.toBe(401);
      }
    },
  );

  it.each(routes.filter(([, guard]) => guard === 'super'))(
    '%s — super only: a sub-admin holding every section is still refused',
    async (route) => {
      const res = await call(route, everything);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
    },
  );

  it.each(routes)('%s — the super admin always passes the guard', async (route) => {
    const res = await call(route, superToken);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('admin permissions — behaviour', () => {
  let superToken: string;

  beforeAll(async () => {
    superToken = await createAdminUser();
  });

  afterAll(async () => {
    await purgeSubAdmins();
    await purgeTestUsers();
  });

  it('[SECURITY] revoking a section takes effect on the very next request of the same session', async () => {
    const sub = await createSubAdmin(['orders'], { suffix: 31 });
    await api.get('/api/admin/orders').set(bearer(sub.token)).expect(200);

    await api
      .patch(`/api/admin/admins/${sub.userId}`)
      .set(bearer(superToken))
      .send({ permissions: ['reviews'] })
      .expect(200);

    const after = await api.get('/api/admin/orders').set(bearer(sub.token));
    expect(after.status).toBe(403);
    expect(after.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
    await api.get('/api/admin/reviews').set(bearer(sub.token)).expect(200);
  });

  it('[SECURITY] «account requests» alone cannot set a customer password without a pending reset request', async () => {
    const customer = await registerAndLogin();
    const onlyRequests = await createSubAdmin(['account_requests'], { suffix: 32 });
    const res = await api
      .patch(`/api/admin/customers/${customer.userId}/password`)
      .set(bearer(onlyRequests.token))
      .send({ newPassword: 'hijacked-pass-1' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_PERMISSION_DENIED');
    // كلمة المرور لم تتغيّر: الدخول القديم ما زال يعمل.
    await api.post('/api/auth/login').send({ phone: customer.phone, password: customer.password }).expect(200);

    const withCustomers = await createSubAdmin(['customers'], { suffix: 33 });
    await api
      .patch(`/api/admin/customers/${customer.userId}/password`)
      .set(bearer(withCustomers.token))
      .send({ newPassword: 'rotated-pass-12' })
      .expect(200);
  });

  it('the offers route changes the offer flags only — other product fields are refused, not ignored', async () => {
    const offers = await createSubAdmin(['offers'], { suffix: 34 });
    const res = await api
      .patch(`/api/admin/offers/${randomUUID()}`)
      .set(bearer(offers.token))
      .send({ isOffer: true, price: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // والمسار العامّ للمنتجات مغلقٌ أمامه.
    const general = await api
      .patch(`/api/admin/products/${randomUUID()}`)
      .set(bearer(offers.token))
      .send({ isOffer: true });
    expect(general.status).toBe(403);
  });

  it('the restock schedule route takes restockAt only', async () => {
    const restock = await createSubAdmin(['restock'], { suffix: 35 });
    const res = await api
      .patch(`/api/admin/restock/${randomUUID()}/schedule`)
      .set(bearer(restock.token))
      .send({ restockAt: null, stock: 50 });
    expect(res.status).toBe(400);
  });

  it('a customer never carries admin permissions — enforced by the database itself', async () => {
    const customer = await registerAndLogin();
    await expect(
      db.query(`UPDATE users SET admin_permissions = '{orders}' WHERE id = $1`, [customer.userId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query('UPDATE users SET is_super_admin = TRUE WHERE id = $1', [customer.userId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(`UPDATE users SET admin_permissions = '{everything}' WHERE phone = '+9647800000000'`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
