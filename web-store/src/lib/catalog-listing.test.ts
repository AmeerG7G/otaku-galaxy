import { beforeEach, describe, expect, it, vi } from 'vitest';

/** `listAllProducts` walks the API's listing to its end — what the sitemap relies on. */

const calls = vi.hoisted(() => ({ pages: [] as number[], limits: [] as number[], total: 0, shift: false }));
vi.mock('./api', () => ({
  apiFetch: async (_path: string, init: { query: { page: number; limit: number } }) => {
    const { page, limit } = init.query;
    calls.pages.push(page);
    calls.limits.push(limit);
    const start = (page - 1) * limit - (calls.shift && page > 1 ? 1 : 0);
    const items = Array.from({ length: Math.max(0, Math.min(limit, calls.total - start)) }, (_, index) => ({
      id: `p${start + index}`,
      images: [],
    }));
    return { data: { items, page, limit, total: calls.total, hasMore: start + items.length < calls.total } };
  },
}));
vi.stubEnv('MEDIA_ORIGIN', 'https://api.example.test');

const { listAllProducts } = await import('./catalog');

beforeEach(() => {
  calls.pages = [];
  calls.limits = [];
  calls.shift = false;
});

describe('listAllProducts', () => {
  it('reads every page at the API’s largest page size and stops when there is no more', async () => {
    calls.total = 120;
    const all = await listAllProducts();
    expect(all).toHaveLength(120);
    expect(calls.pages).toEqual([1, 2, 3]);
    expect(new Set(calls.limits)).toEqual(new Set([50]));
  });

  it('one page is one call; an empty catalogue is one call and no products', async () => {
    calls.total = 7;
    expect(await listAllProducts()).toHaveLength(7);
    expect(calls.pages).toEqual([1]);
    calls.pages = [];
    calls.total = 0;
    expect(await listAllProducts()).toEqual([]);
    expect(calls.pages).toEqual([1]);
  });

  it('a product that slides onto the next page while walking is listed once', async () => {
    calls.total = 60;
    calls.shift = true;
    const ids = (await listAllProducts()).map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
