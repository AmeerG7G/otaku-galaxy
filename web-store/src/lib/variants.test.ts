import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductVariant } from './types';
import type { SessionData } from './session';
import { cartAddBody, customerVariants, initialVariantId, lineColorName, safeHex, variantAvailable, variantKindText } from './variants';

/** Product colours on the storefront (STEP 74, contract §2–§4). */

const variant = (overrides: Partial<ProductVariant>): ProductVariant => ({
  id: 'v',
  colorName: 'أحمر',
  colorNameAr: 'أحمر',
  colorNameCkb: null,
  colorHex: '#FF0000',
  imageUrl: 'http://api.test/uploads/product/red.png',
  stock: 3,
  isActive: true,
  sortOrder: 0,
  ...overrides,
});

describe('customer colours', () => {
  it('hides inactive colours and keeps the admin order', () => {
    const variants = customerVariants({
      variants: [
        variant({ id: 'c', sortOrder: 2 }),
        variant({ id: 'hidden', sortOrder: 0, isActive: false }),
        variant({ id: 'a', sortOrder: 1 }),
      ],
    });
    expect(variants.map((v) => v.id)).toEqual(['a', 'c']);
    expect(customerVariants({})).toEqual([]);
  });

  it('a colour with stock 0 cannot be chosen; the first colour in stock is pre-selected', () => {
    const variants = [variant({ id: 'out', stock: 0 }), variant({ id: 'blue', stock: 2 })];
    expect(variantAvailable(variants[0]!)).toBe(false);
    expect(initialVariantId(variants)).toBe('blue');
    expect(initialVariantId([variant({ stock: 0 })])).toBeNull();
  });

  it('a swatch is drawn only from a well-formed #RRGGBB', () => {
    expect(safeHex('#00FF7a')).toBe('#00FF7a');
    expect(safeHex('red')).toBeNull();
    expect(safeHex('url(javascript:alert(1))')).toBeNull();
    expect(safeHex(null)).toBeNull();
  });

  it('line colour names: Arabic by default, Kurdish only when rendering Kurdish and present', () => {
    const line = { variantColorName: 'أحمر', variantColorNameAr: 'أحمر', variantColorNameCkb: 'سوور' };
    expect(lineColorName(line)).toBe('أحمر');
    expect(lineColorName(line, 'ckb')).toBe('سوور');
    expect(lineColorName({ ...line, variantColorNameCkb: null }, 'ckb')).toBe('أحمر');
    expect(lineColorName({ variantColorName: null })).toBeNull();
    expect(lineColorName({})).toBeNull();
  });
});

describe('variantKindText — what the options are (090)', () => {
  it('names the picker and the line by kind', () => {
    expect(variantKindText('design').label).toBe('التصميم');
    expect(variantKindText('size').chooseFirst).toBe('اختر مقاس المنتج');
  });
  it('an absent or unknown kind (older API, older order line) is a colour, wording unchanged', () => {
    expect(variantKindText(undefined)).toEqual({ label: 'اللون', chooseFirst: 'اختر لون المنتج', ofThis: 'من هذا اللون' });
    expect(variantKindText(null).label).toBe('اللون');
    expect(variantKindText('flavour' as never).label).toBe('اللون');
  });
});

describe('cartAddBody', () => {
  it('forwards the chosen colour and sends null for a product without colours', () => {
    expect(cartAddBody({ productId: 'p', quantity: 2, optionValue: 'M', variantId: 'v-red' })).toEqual({
      productId: 'p',
      quantity: 2,
      optionValue: 'M',
      variantId: 'v-red',
    });
    expect(cartAddBody({ productId: 'p', quantity: 1 })).toEqual({ productId: 'p', quantity: 1, optionValue: null, variantId: null });
    expect(cartAddBody({ productId: 'p', quantity: 1, variantId: { id: 'x' } }).variantId).toBeNull();
    expect(cartAddBody({ productId: 'p', quantity: 1, variantId: '' }).variantId).toBeNull();
  });
});

const state = vi.hoisted(() => ({ calls: [] as Array<{ path: string; body: unknown }>, data: { items: [] } as unknown }));

vi.mock('@/lib/server-session', () => ({
  readSession: async (): Promise<SessionData> => ({ token: 'jwt', exp: 4_000_000_000, user: { id: 'u', username: 'زبون', phone: '07700000000' } }),
  clearSession: async () => {},
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: async (path: string, request: { body?: unknown } = {}) => {
    state.calls.push({ path, body: request.body });
    return { data: state.data, message: 'أُضيف', headers: new Headers() };
  },
}));

describe('POST /bff/cart', () => {
  const SITE = 'http://127.0.0.1:3000';
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', SITE);
    state.calls = [];
  });

  it('[CRITICAL] sends variantId through to the API cart', async () => {
    const { POST } = await import('@/app/bff/cart/route');
    const response = await POST(
      new Request(`${SITE}/bff/cart`, {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'application/json' },
        body: JSON.stringify({ productId: 'p1', quantity: 1, optionValue: null, variantId: 'v-blue', extra: 'dropped' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{ path: '/cart', body: { productId: 'p1', quantity: 1, optionValue: null, variantId: 'v-blue' } }]);
  });
});

describe('getProduct', () => {
  it('resolves each colour image against the media origin, like the product images', async () => {
    vi.stubEnv('MEDIA_ORIGIN', 'https://media.test');
    state.data = {
      id: 'p9',
      images: ['/uploads/product/main.png'],
      variants: [variant({ imageUrl: '/uploads/product/red.png' }), variant({ id: 'w', imageUrl: 'javascript:alert(1)' })],
    };
    const { getProduct } = await import('./catalog');
    const product = await getProduct('p9');
    expect(product.images).toEqual(['https://media.test/uploads/product/main.png']);
    expect(product.variants!.map((v) => v.imageUrl)).toEqual(['https://media.test/uploads/product/red.png', '']);
  });
});
