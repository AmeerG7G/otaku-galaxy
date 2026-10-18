import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every upstream call, catalog reads included, must act for the shopper who
 * caused it: signed shopper IP, never Next's shared fetch cache. A cached
 * catalog read would reach the API as this server's own address, one
 * rate-limit bucket that any visitor could drain with cache misses.
 */

const SHOPPER = '203.0.113.50';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': SHOPPER }) }));

const { getProduct, listCategories, listGovernorates, listLoyaltyLevels, listProducts, listZones, searchProducts } = await import('./catalog');

const calls: Array<{ url: string; init: RequestInit & { next?: unknown } }> = [];

beforeEach(() => {
  vi.stubEnv('BFF_SHARED_SECRET', 'test-secret-test-secret-test-secret-1234');
  vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000/api');
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const data = String(url).includes('/catalog/products/0') ? { id: 'x', images: [] } : { items: [], total: 0, page: 1, limit: 24 };
    return new Response(JSON.stringify({ success: true, data, message: null }), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('catalog reads', () => {
  it('are signed for the shopper and bypass the fetch cache', async () => {
    const productId = '00000000-0000-4000-8000-000000000000';
    await listCategories();
    await listProducts({ page: 7, sort: 'price_asc' });
    await searchProducts('random-term-nobody-searched');
    await getProduct(productId);
    await listGovernorates();
    await listZones('00000000-0000-4000-8000-000000000001');
    await listLoyaltyLevels();

    expect(calls).toHaveLength(7);
    for (const { url, init } of calls) {
      const headers = init.headers as Record<string, string>;
      expect(init.cache, url).toBe('no-store');
      expect(init.next, url).toBeUndefined();
      expect(headers['X-OG-Client-IP'], url).toBe(SHOPPER);
      expect(headers['X-OG-Client-Signature'], url).toMatch(/^\d+\.[0-9a-f]{64}$/);
      expect(headers.Authorization, url).toBeUndefined();
    }
  });
});
