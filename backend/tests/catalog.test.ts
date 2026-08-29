import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

describe('catalog endpoints', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
  });

  it('serves home data: banners, offers, categories with subcategories', async () => {
    const res = await api.get('/api/catalog/home');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data.banners)).toBe(true);
    expect(Array.isArray(data.offers)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.categories[0]).toHaveProperty('subcategories');
    expect(Array.isArray(data.discover)).toBe(true);
  });

  it('lists products with pagination and filters by category', async () => {
    const res = await api
      .get('/api/catalog/products')
      .query({ categoryId: catalog.categoryId, limit: 2 });
    expect(res.status).toBe(200);
    const { items, total, hasMore } = res.body.data;
    expect(items.length).toBe(2);
    expect(total).toBeGreaterThan(0);
    expect(hasMore).toBe(true);
    expect(items[0].images).toBeDefined();
  });

  it('searches products by Arabic name', async () => {
    const res = await api.get('/api/catalog/products/search').query({ q: 'تيشيرت' });
    expect(res.status).toBe(200);
    const names = res.body.data.items.map((i: { name: string }) => i.name);
    expect(names.length).toBeGreaterThan(0);
  });

  it('returns product detail with images and options', async () => {
    const res = await api.get(`/api/catalog/products/${catalog.productIds[0]}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(catalog.productIds[0]);
    expect(res.body.data.price).toBe(15000);
    expect(Array.isArray(res.body.data.images)).toBe(true);
  });

  it('404 for unknown product', async () => {
    const res = await api.get('/api/catalog/products/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('lists governorates', async () => {
    const res = await api.get('/api/catalog/governorates');
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });
});

/**
 * حقول العروض يجب أن تصل من كل مسارات الكتالوج بنفس الشكل: القوائم،
 * تفاصيل المنتج، وقسم «اكتشف» في الرئيسية. كان مسار التفاصيل يغفلها
 * فتظهر بطاقة المنتج بخصم ولا تظهر صفحته — وهو ما تحرسه هذه الاختبارات.
 */
describe('promotion fields are exposed consistently', () => {
  const PROMO_KEYS = [
    'previousPrice',
    'discountPercent',
    'hasDeliveryPromo',
    'franchiseIds',
  ] as const;

  let adminToken: string;
  let productId: string;

  beforeAll(async () => {
    const catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    productId = catalog.productIds[0]!;
  });

  it('list, detail and home discover all carry the promotion fields', async () => {
    const list = await api.get('/api/catalog/products?page=1&limit=1').expect(200);
    const detail = await api.get(`/api/catalog/products/${productId}`).expect(200);
    const home = await api.get('/api/catalog/home').expect(200);

    for (const key of PROMO_KEYS) {
      expect(list.body.data.items[0]).toHaveProperty(key);
      expect(detail.body.data).toHaveProperty(key);
    }
    if (home.body.data.discover.length > 0) {
      for (const key of PROMO_KEYS) {
        expect(home.body.data.discover[0]).toHaveProperty(key);
      }
    }
  });

  it('a real previous price produces a computed discount percent', async () => {
    const before = await api.get(`/api/catalog/products/${productId}`).expect(200);
    const price = before.body.data.price as number;

    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ previousPrice: price * 2 })
      .expect(200);

    const after = await api.get(`/api/catalog/products/${productId}`).expect(200);
    expect(after.body.data.previousPrice).toBe(price * 2);
    expect(after.body.data.discountPercent).toBe(50);

    // إزالة السعر السابق تُخفي الخصم بالكامل — لا شارة بلا بيانات.
    await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ previousPrice: null })
      .expect(200);
    const cleared = await api.get(`/api/catalog/products/${productId}`).expect(200);
    expect(cleared.body.data.previousPrice).toBeNull();
    expect(cleared.body.data.discountPercent).toBeNull();
  });

  it('a previous price below the current price is refused with a clear error', async () => {
    const response = await api
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ previousPrice: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PREVIOUS_PRICE');
  });
});

/**
 * الترتيب يجب أن يغيّر النتائج فعلاً على الخادم — لا أن يكون منتقياً
 * في الواجهة بلا أثر. والقائمة مغلقة، فأي قيمة أخرى تُرفض.
 */
describe('product sorting', () => {
  const prices = (body: { data: { items: { price: number }[] } }) =>
    body.data.items.map((p) => p.price);

  it('price_asc and price_desc are genuinely ordered and mirror each other', async () => {
    const asc = await api
      .get('/api/catalog/products?page=1&limit=20&sort=price_asc')
      .expect(200);
    const desc = await api
      .get('/api/catalog/products?page=1&limit=20&sort=price_desc')
      .expect(200);

    const ascPrices = prices(asc.body);
    const descPrices = prices(desc.body);

    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
    expect(ascPrices[0]).toBeLessThanOrEqual(descPrices[0]);
  });

  it('every supported sort returns results', async () => {
    for (const sort of ['newest', 'price_asc', 'price_desc', 'rating']) {
      const response = await api
        .get(`/api/catalog/products?page=1&limit=5&sort=${sort}`)
        .expect(200);
      expect(response.body.data.items.length).toBeGreaterThan(0);
    }
  });

  it('an unknown sort value is rejected, never interpolated into SQL', async () => {
    const response = await api.get(
      '/api/catalog/products?page=1&limit=5&sort=price_asc; DROP TABLE products',
    );
    expect(response.status).toBe(400);

    // الجدول سليم بعدها.
    const still = await api.get('/api/catalog/products?page=1&limit=1').expect(200);
    expect(still.body.data.items.length).toBe(1);
  });

  it('omitting sort keeps the previous default behaviour', async () => {
    const response = await api.get('/api/catalog/products?page=1&limit=5').expect(200);
    expect(response.body.data.items.length).toBe(5);
  });
});
