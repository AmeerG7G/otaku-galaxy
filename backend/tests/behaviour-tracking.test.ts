import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { isTrackableSearchTerm, storeDay, trackingService } from '../src/services/trackingService.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';
import { createProduct } from './orderFixtures.js';

/**
 * التتبّع التجميعي (D3) — مطفأ افتراضياً، تجميعيّ، وبلا معلومةٍ شخصية.
 *
 * [CRITICAL] مطفأ: لا يُكتب شيء أبداً مهما أرسل التطبيق. مُشغَّل: عدّادات يومية
 * لا تتضاعف بالمزامنة ولا بإعادة الجلب، والمسؤول والحساب الداخلي لا يُعدّان.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const mutableAnalytics = config.analytics as { trackingEnabled: boolean };
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
const productIds: string[] = [];

async function counters(productId: string) {
  const { rows } = await db.query<{ views: number; cart_adds: number; share_opens: number; share_confirmed: number }>(
    'SELECT views, cart_adds, share_opens, share_confirmed FROM product_daily_counters WHERE stat_date = $1::date AND product_id = $2',
    [storeDay(), productId],
  );
  return rows[0] ?? { views: 0, cart_adds: 0, share_opens: 0, share_confirmed: 0 };
}

async function newProduct() {
  const product = await createProduct({ categoryId: catalog.categoryId, price: 5000, label: 'تتبّع' });
  productIds.push(product.id);
  return product;
}

beforeAll(async () => {
  catalog = await seedTestCatalog();
});

afterEach(() => {
  mutableAnalytics.trackingEnabled = false;
});

afterAll(async () => {
  await db.query('DELETE FROM product_daily_counters WHERE product_id = ANY($1::uuid[])', [productIds]);
  await db.query("DELETE FROM search_daily_terms WHERE term LIKE 'تتبعاختبار%' OR term LIKE 'trackprobe%'");
  await purgeTestUsers();
});

describe('مطفأ افتراضياً', () => {
  it('[CRITICAL] الإعداد الافتراضي مطفأ، والتطبيق يُخبَر بذلك', async () => {
    expect(config.analytics.trackingEnabled).toBe(false);
    const settings = await api.get('/api/catalog/settings').expect(200);
    expect(settings.body.data.tracking).toEqual({ enabled: false });
  });

  it('[CRITICAL] لا إشارة تُكتب وهو مطفأ — مشاهدة، سلة، بحث، مشاركة، فتح، دخول', async () => {
    const customer = await registerAndLogin();
    const product = await newProduct();
    await api.get(`/api/catalog/products/${product.id}`).set('X-OG-Track', 'view').expect(200);
    await api.post('/api/cart').set(bearer(customer.token)).send({ productId: product.id, quantity: 1 }).expect(200);
    await api.get('/api/catalog/products/search').query({ q: 'trackprobe-off' }).set('X-OG-Track', 'search').expect(200);
    await api.post('/api/tracking/share').set(bearer(customer.token)).send({ productId: product.id, result: 'success' }).expect(204);
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'فتح مطفأ') RETURNING id",
      [customer.userId],
    );
    await api.post(`/api/notifications/${rows[0]!.id}/opened`).set(bearer(customer.token)).expect(204);
    await api.post('/api/auth/login').send({ phone: customer.phone, password: customer.password }).expect(200);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await counters(product.id)).toEqual({ views: 0, cart_adds: 0, share_opens: 0, share_confirmed: 0 });
    const opened = await db.query<{ opened_at: Date | null }>('SELECT opened_at FROM notifications WHERE id = $1', [rows[0]!.id]);
    expect(opened.rows[0]!.opened_at).toBeNull();
    const activity = await db.query('SELECT 1 FROM user_daily_activity WHERE user_id = $1', [customer.userId]);
    expect(activity.rowCount).toBe(0);
    const terms = await db.query("SELECT 1 FROM search_daily_terms WHERE term LIKE 'trackprobe%'");
    expect(terms.rowCount).toBe(0);
  });
});

describe('مُشغَّل', () => {
  it('[CRITICAL] المشاهدة تُعدّ بإعلان الشاشة وحده، والإضافة بإضافة الزبون وحدها (لا المزامنة)', async () => {
    mutableAnalytics.trackingEnabled = true;
    const customer = await registerAndLogin();
    const product = await newProduct();
    await api.get(`/api/catalog/products/${product.id}`).expect(200); // جلبٌ بلا إعلان
    await api.get(`/api/catalog/products/${product.id}`).set('X-OG-Track', 'view').expect(200);
    await api.post('/api/cart').set(bearer(customer.token)).send({ productId: product.id, quantity: 1 }).expect(200);
    await api.get('/api/cart').set(bearer(customer.token)).expect(200); // مزامنة
    await vi.waitFor(async () => expect(await counters(product.id)).toMatchObject({ views: 1, cart_adds: 1 }));
  });

  it('[CRITICAL] المسؤول والحساب الداخلي لا يُعدّان', async () => {
    mutableAnalytics.trackingEnabled = true;
    const adminToken = await createAdminUser();
    const internal = await registerAndLogin();
    await api
      .patch(`/api/admin/customers/${internal.userId}/internal`)
      .set(bearer(adminToken))
      .send({ isInternal: true, reason: 'حساب اختبار' })
      .expect(200);
    const product = await newProduct();
    await api.get(`/api/catalog/products/${product.id}`).set(bearer(adminToken)).set('X-OG-Track', 'view').expect(200);
    await api.post('/api/cart').set(bearer(internal.token)).send({ productId: product.id, quantity: 1 }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await counters(product.id)).toMatchObject({ views: 0, cart_adds: 0 });
  });

  it('المشاركة: الفتح يُعدّ دائماً، و«المؤكَّدة» عند success وحدها', async () => {
    mutableAnalytics.trackingEnabled = true;
    const customer = await registerAndLogin();
    const product = await newProduct();
    await api.post('/api/tracking/share').set(bearer(customer.token)).send({ productId: product.id, result: 'success' }).expect(204);
    await api.post('/api/tracking/share').set(bearer(customer.token)).send({ productId: product.id, result: 'dismissed' }).expect(204);
    await vi.waitFor(async () => expect(await counters(product.id)).toMatchObject({ share_opens: 2, share_confirmed: 1 }));
    await api.post('/api/tracking/share').set(bearer(customer.token)).send({ productId: product.id, result: 'maybe' }).expect(400);
  });

  it('[CRITICAL] البحث النهائي يُطوى ويُعدّ؛ ما يشبه هاتفاً أو بريداً لا يُحفظ أبداً', async () => {
    mutableAnalytics.trackingEnabled = true;
    await api.get('/api/catalog/products/search').query({ q: 'trackprobe zero' }).set('X-OG-Track', 'search').expect(200);
    await api.get('/api/catalog/products/search').query({ q: 'trackprobe zero', page: 2 }).set('X-OG-Track', 'search').expect(200);
    await api.get('/api/catalog/products/search').query({ q: 'trackprobe zero' }).expect(200); // إعادة بلا إعلان
    await api.get('/api/catalog/products/search').query({ q: '0771 234 5678' }).set('X-OG-Track', 'search').expect(200);
    await api.get('/api/catalog/products/search').query({ q: 'a@b.co' }).set('X-OG-Track', 'search').expect(200);
    await vi.waitFor(async () => {
      const { rows } = await db.query<{ term: string; searches: number; zero_result: number }>(
        "SELECT term, searches, zero_result FROM search_daily_terms WHERE stat_date = $1::date AND term LIKE 'trackprobe%'",
        [storeDay()],
      );
      expect(rows).toEqual([{ term: 'trackprobe zero', searches: 1, zero_result: 1 }]);
    });
    const leaked = await db.query("SELECT 1 FROM search_daily_terms WHERE term LIKE '%0771%' OR term LIKE '%@%'");
    expect(leaked.rowCount).toBe(0);
    expect(isTrackableSearchTerm('0771-234-5678')).toBe(false);
    expect(isTrackableSearchTerm('x')).toBe(false);
    expect(isTrackableSearchTerm('ون بيس')).toBe(true);
  });

  it('[CRITICAL] فتح الإشعار: أول كتابة تفوز، ولإشعار صاحبه وحده', async () => {
    mutableAnalytics.trackingEnabled = true;
    const owner = await registerAndLogin();
    const other = await registerAndLogin();
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO notifications (user_id, type, title) VALUES ($1, 'promotion', 'فتح') RETURNING id",
      [owner.userId],
    );
    const id = rows[0]!.id;
    await api.post(`/api/notifications/${id}/opened`).set(bearer(other.token)).expect(204);
    expect((await db.query<{ opened_at: Date | null }>('SELECT opened_at FROM notifications WHERE id = $1', [id])).rows[0]!.opened_at).toBeNull();
    await api.post(`/api/notifications/${id}/opened`).set(bearer(owner.token)).expect(204);
    const first = (await db.query<{ opened_at: Date }>('SELECT opened_at FROM notifications WHERE id = $1', [id])).rows[0]!.opened_at;
    await api.post(`/api/notifications/${id}/opened`).set(bearer(owner.token)).expect(204);
    const second = (await db.query<{ opened_at: Date }>('SELECT opened_at FROM notifications WHERE id = $1', [id])).rows[0]!.opened_at;
    expect(second.getTime()).toBe(first.getTime());
  });

  it('الدخول يُعدّ في يومه، والزبون النشط صفٌّ واحد في اليوم', async () => {
    // يُنشأ الحساب قبل التشغيل: `registerAndLogin` نفسه يسجّل دخولاً.
    const customer = await registerAndLogin();
    mutableAnalytics.trackingEnabled = true;
    await api.post('/api/auth/login').send({ phone: customer.phone, password: customer.password }).expect(200);
    await api.get('/api/cart').set(bearer(customer.token)).expect(200);
    await api.get('/api/cart').set(bearer(customer.token)).expect(200);
    await vi.waitFor(async () => {
      const { rows } = await db.query<{ logins: number }>(
        'SELECT logins FROM user_daily_activity WHERE user_id = $1 AND activity_date = $2::date',
        [customer.userId, storeDay()],
      );
      expect(rows).toEqual([{ logins: 1 }]);
    });
  });

  it('حقبة التتبّع تتبع الإعداد: تُفتح مرة واحدة حين يُشغَّل، وتُغلق حين يُطفأ', async () => {
    const before = await db.query<{ id: string }>('SELECT id::text FROM analytics_tracking_epochs');
    const existing = new Set(before.rows.map((r) => r.id));
    mutableAnalytics.trackingEnabled = false;
    await trackingService.syncEpoch();
    mutableAnalytics.trackingEnabled = true;
    expect(await trackingService.syncEpoch()).toBe('opened');
    expect(await trackingService.syncEpoch()).toBe('unchanged');
    mutableAnalytics.trackingEnabled = false;
    expect(await trackingService.syncEpoch()).toBe('closed');
    const after = await db.query<{ id: string }>('SELECT id::text FROM analytics_tracking_epochs');
    const created = after.rows.map((r) => r.id).filter((id) => !existing.has(id));
    expect(created).toHaveLength(1);
    await db.query('DELETE FROM analytics_tracking_epochs WHERE id = ANY($1::bigint[])', [created]);
  });
});
