import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, seedTestCatalog } from './helpers.js';

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