import { existsSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatIqd } from './format';
import type { Category, Paginated, Product } from './types';

/**
 * The public catalogue pages as a search engine reads them: the sitemap, each
 * page's canonical URL and robots state, the product's structured data next
 * to what the page shows, and a real 404 for anything that does not exist.
 */

const ORIGIN = 'https://otakugalaxystore.com';
const ACC = 'd20bf102-00e0-43b3-ac22-344d4d25f9e2';
const EMPTY = '0f93cede-ba7f-4a27-9287-8815680be337';
const P1 = '38f181d8-c570-46d3-8c06-a2aa740c6764';
const P2 = '8ddcd2f3-cd8a-4f20-8550-cd033dcc4613';
const P3 = 'bafc15a9-491a-4ad1-a894-4a6547a23de4';
const SUB = '5b1d8f2e-1111-4a2a-9c3d-222222222222';

const category = (id: string, name: string, subs: Category['subcategories'] = []): Category => ({ id, name, imageUrl: null, sortOrder: 0, isActive: true, subcategories: subs });
const product = (id: string, over: Partial<Product> = {}): Product => ({
  id,
  name: `منتج ${id.slice(0, 4)}`,
  description: 'وصف المنتج',
  price: 3000,
  pairPrice: null,
  stock: 4,
  images: [`https://api.otakugalaxystore.com/uploads/product/2026/11/${id}.jpg`],
  categoryId: ACC,
  subcategoryId: null,
  isActive: true,
  previousPrice: null,
  discountPercent: null,
  hasDeliveryPromo: false,
  deliveryPromoAmount: 0,
  restockAt: null,
  options: [],
  ...over,
});
const page = (items: Product[]): Paginated<Product> => ({ items, page: 1, limit: 24, total: items.length, hasMore: false });

const state = vi.hoisted(() => ({
  categories: [] as unknown[],
  all: [] as unknown[],
  listing: (() => ({ items: [] as unknown[], page: 1, limit: 24, total: 0, hasMore: false })) as (options: { categoryId?: string; subcategoryId?: string }) => { items: unknown[]; page: number; limit: number; total: number; hasMore: boolean },
  products: {} as Record<string, unknown>,
}));
vi.mock('@/lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalog')>()),
  listCategories: async () => state.categories,
  listAllProducts: async () => state.all,
  listProducts: async (options: { categoryId?: string; subcategoryId?: string }) => state.listing(options),
  getAppPromo: async () => null,
  getProduct: async (id: string) => {
    if (id in state.products) return state.products[id];
    const { ApiError } = await import('./api');
    throw new ApiError(404, 'NOT_FOUND', 'not found');
  },
  listProductReviews: async () => [],
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-nonce': 'n0nce' }) }));
vi.mock('@/lib/server-session', () => ({ readSession: async () => null }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));
vi.mock('@/components/AddToCart', () => ({ AddToCart: () => createElement('button', { 'data-add-to-cart': '' }, 'add') }));

vi.stubEnv('SITE_ORIGIN', ORIGIN);

const { default: sitemap } = await import('@/app/sitemap');
const home = await import('@/app/(home)/page');
const categoryPage = await import('@/app/c/[id]/page');
const productPage = await import('@/app/p/[id]/page');
const { default: ProductLayout } = await import('@/app/p/[id]/layout');
const { default: CategoryLayout } = await import('@/app/c/[id]/layout');

const params = (id: string) => Promise.resolve({ id });
const query = (q: Record<string, string> = {}) => Promise.resolve(q);

beforeEach(() => {
  state.categories = [category(ACC, 'الاكسسوارات', [{ id: SUB, name: 'بروشات', isActive: true } as Category['subcategories'][number]]), category(EMPTY, 'الملابس')];
  state.all = [product(P1), product(P2), product(P3, { price: null })];
  state.products = { [P1]: product(P1), [P2]: product(P2), [P3]: product(P3, { price: null }) };
  state.listing = ({ categoryId }) => (categoryId === EMPTY ? page([]) : page([product(P1), product(P2), product(P3, { price: null })]));
});

describe('sitemap.xml', () => {
  it('lists home, the categories index, stocked categories, every listed product and the legal pages', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual([
      // As Next renders the home canonical: the bare origin.
      ORIGIN,
      `${ORIGIN}/categories`,
      `${ORIGIN}/c/${ACC}`,
      `${ORIGIN}/p/${P1}`,
      `${ORIGIN}/p/${P2}`,
      `${ORIGIN}/p/${P3}`,
      `${ORIGIN}/privacy-policy`,
      `${ORIGIN}/delete-account`,
    ]);
  });

  it('[CRITICAL] leaves out empty categories, private pages, sorted or paged variants, and invented dates', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).not.toContain(`${ORIGIN}/c/${EMPTY}`);
    for (const url of urls) {
      expect(url === ORIGIN || url.startsWith(`${ORIGIN}/`), url).toBe(true);
      expect(new URL(url).search, url).toBe('');
      expect(url).not.toMatch(/\/(bff|account|cart|checkout|login|register|orders|search|favorites|points|alerts|notifications|forgot-password)\b/);
      expect(url).not.toMatch(/staging|admin\.|api\./);
    }
    for (const entry of entries) expect(entry).not.toHaveProperty('lastModified');
  });

  it('names each legal page’s English version as its alternate', async () => {
    const privacy = (await sitemap()).find((entry) => entry.url === `${ORIGIN}/privacy-policy`);
    expect(privacy?.alternates?.languages).toEqual({ ar: `${ORIGIN}/privacy-policy`, en: `${ORIGIN}/privacy-policy?lang=en` });
  });
});

describe('canonical URLs and robots state', () => {
  it('home: sorting is dropped, a later page is kept, the title names the store and what it sells', async () => {
    const meta = await home.generateMetadata({ searchParams: query({ sort: 'price_asc', page: '2' }) });
    expect(meta.alternates?.canonical).toBe('/?page=2');
    expect((await home.generateMetadata({ searchParams: query({ sort: 'rating' }) })).alternates?.canonical).toBe('/');
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toEqual({ absolute: 'مجرة الأوتاكو | متجر منتجات الأنمي في العراق' });
    expect(meta.openGraph).toMatchObject({ siteName: 'مجرة الأوتاكو', locale: 'ar_IQ', url: '/?page=2' });
  });

  it('home past its last page is noindex, links still followed', async () => {
    state.listing = () => page([]);
    expect((await home.generateMetadata({ searchParams: query({ page: '9' }) })).robots).toEqual({ index: false, follow: true });
  });

  it('a category: its own path, subcategory and page kept, sort dropped, its own title and description', async () => {
    const meta = await categoryPage.generateMetadata({ params: params(ACC), searchParams: query({ sort: 'price_desc', page: '3' }) });
    expect(meta.alternates?.canonical).toBe(`/c/${ACC}?page=3`);
    expect(meta.title).toBe('الاكسسوارات — منتجات الأنمي');
    expect(meta.description).toBe('تصفّح الاكسسوارات في مجرة الأوتاكو، متجر منتجات الأنمي في العراق.');
    expect(meta.robots).toBeUndefined();
    const sub = await categoryPage.generateMetadata({ params: params(ACC), searchParams: query({ sub: SUB, sort: 'rating' }) });
    expect(sub.alternates?.canonical).toBe(`/c/${ACC}?sub=${SUB}`);
    expect(sub.title).toBe('بروشات — الاكسسوارات — منتجات الأنمي');
    // An unknown subcategory id is the whole category, not a page of its own.
    const unknownSub = await categoryPage.generateMetadata({ params: params(ACC), searchParams: query({ sub: 'nope' }) });
    expect(unknownSub.alternates?.canonical).toBe(`/c/${ACC}`);
  });

  it('an empty category is noindex (links still followed) until it has products', async () => {
    const meta = await categoryPage.generateMetadata({ params: params(EMPTY), searchParams: query() });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe(`/c/${EMPTY}`);
  });

  it('a product: its own path whatever the review page, with its cover as the share image', async () => {
    const meta = await productPage.generateMetadata({ params: params(P1), searchParams: query({ reviews: '3' }) });
    expect(meta.alternates?.canonical).toBe(`/p/${P1}`);
    expect(meta.openGraph).toMatchObject({ siteName: 'مجرة الأوتاكو', locale: 'ar_IQ', images: [{ url: `https://api.otakugalaxystore.com/uploads/product/2026/11/${P1}.jpg` }] });
    expect(meta.robots).toBeUndefined();
  });
});

describe('product page', () => {
  async function render(id: string): Promise<string> {
    return renderToStaticMarkup(await productPage.default({ params: params(id), searchParams: query() }));
  }
  function jsonLd(html: string): [Record<string, unknown>, Record<string, unknown>] {
    const match = html.match(/<script type="application\/ld\+json" nonce="n0nce">([\s\S]*?)<\/script>/);
    expect(match, 'JSON-LD with the request nonce').not.toBeNull();
    return JSON.parse(match?.[1] ?? 'null') as [Record<string, unknown>, Record<string, unknown>];
  }

  it('[CRITICAL] the Offer is the price the page shows, in IQD, with its stock state', async () => {
    const html = await render(P1);
    const [data, crumbs] = jsonLd(html);
    expect(html).toContain(formatIqd(3000));
    expect(data).toMatchObject({ '@type': 'Product', name: product(P1).name, offers: { price: '3000', priceCurrency: 'IQD', availability: 'https://schema.org/InStock' } });
    expect(data).not.toHaveProperty('aggregateRating');
    expect(crumbs).toMatchObject({ '@type': 'BreadcrumbList' });
  });

  it('[CRITICAL] a product without an announced price carries no Offer', async () => {
    const [data] = jsonLd(await render(P3));
    expect(data).not.toHaveProperty('offers');
  });

  it('shows the breadcrumb to its category — the same crumbs as the markup', async () => {
    const html = await render(P1);
    expect(html).toContain('aria-label="مسار التنقل"');
    expect(html).toContain(`href="/c/${ACC}"`);
    const [, crumbs] = jsonLd(html);
    expect((crumbs.itemListElement as { name: string }[]).map((item) => item.name)).toEqual(['الرئيسية', 'الاكسسوارات', product(P1).name]);
  });

  it('lists other products of the same category, never itself', async () => {
    const html = await render(P1);
    const related = html.slice(html.indexOf('id="related-title"'));
    expect(related).toContain('المزيد من الاكسسوارات');
    expect(related).toContain(`href="/p/${P2}"`);
    expect(related).not.toContain(`href="/p/${P1}"`);
  });

  it('no category, no related list and no category crumb — nothing guessed', async () => {
    state.categories = [];
    const html = await render(P1);
    expect(html).not.toContain('related-title');
    const [, crumbs] = jsonLd(html);
    expect((crumbs.itemListElement as unknown[]).length).toBe(2);
  });
});

describe('[CRITICAL] real 404 status for what does not exist', () => {
  const notFoundDigest = /NEXT_HTTP_ERROR_FALLBACK;404/;
  async function digest(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
    } catch (error) {
      return String((error as { digest?: string }).digest);
    }
    return 'rendered';
  }

  it('an unknown or malformed product id is a 404 from the layout, before any loading boundary', async () => {
    expect(await digest(() => ProductLayout({ children: 'x', params: params('11111111-2222-4333-8444-555555555555') }))).toMatch(notFoundDigest);
    expect(await digest(() => ProductLayout({ children: 'x', params: params('not-a-uuid') }))).toMatch(notFoundDigest);
    expect(await ProductLayout({ children: 'shown', params: params(P1) })).toBe('shown');
  });

  it('an unknown or malformed category id is a 404 from the layout', async () => {
    expect(await digest(() => CategoryLayout({ children: 'x', params: params('11111111-2222-4333-8444-555555555555') }))).toMatch(notFoundDigest);
    expect(await digest(() => CategoryLayout({ children: 'x', params: params('not-a-uuid') }))).toMatch(notFoundDigest);
    expect(await CategoryLayout({ children: 'shown', params: params(EMPTY) })).toBe('shown');
  });

  it('no loading boundary wraps those layouts — a fallback would fix the status at 200 (Next.js loading.js “Status codes”)', () => {
    const app = path.resolve(__dirname, '../app');
    expect(existsSync(path.join(app, 'loading.tsx')), 'root loading.tsx wraps every route').toBe(false);
    expect(existsSync(path.join(app, 'p', 'loading.tsx'))).toBe(false);
    expect(existsSync(path.join(app, 'c', 'loading.tsx'))).toBe(false);
    expect(existsSync(path.join(app, 'p', '[id]', 'layout.tsx'))).toBe(true);
    expect(existsSync(path.join(app, 'c', '[id]', 'layout.tsx'))).toBe(true);
    // The skeletons stay — below the checks.
    expect(existsSync(path.join(app, 'p', '[id]', 'loading.tsx'))).toBe(true);
    expect(existsSync(path.join(app, 'c', '[id]', 'loading.tsx'))).toBe(true);
    expect(existsSync(path.join(app, '(home)', 'loading.tsx'))).toBe(true);
  });
});
