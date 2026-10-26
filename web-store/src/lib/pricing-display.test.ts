import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { pairOfferLabel, PRICE_COMING_SOON } from './format';
import type { Product } from './types';

/**
 * [CRITICAL] «قريباً — السعر يُعلن لاحقاً» (084) and «قطعتان بسعر» (085) on the
 * storefront. A product without a price is shown and never sold: no price
 * figure (never «0 د.ع»), no add-to-cart. Every amount still comes from the
 * API — these only label what the server decided.
 */

const state = vi.hoisted(() => ({ product: null as unknown }));
vi.mock('@/lib/catalog', () => ({
  isUuid: () => true,
  getProduct: async () => state.product,
}));
vi.mock('@/lib/server-session', () => ({ readSession: async () => null }));
vi.mock('@/components/AddToCart', () => ({ AddToCart: () => createElement('button', { 'data-add-to-cart': '' }, 'add') }));

const { default: ProductPage } = await import('@/app/p/[id]/page');
const { ProductCard } = await import('@/components/ProductCard');

const base: Product = {
  id: '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10',
  name: 'حقيبة',
  description: 'وصف',
  price: 4000,
  pairPrice: null,
  stock: 5,
  images: [],
  categoryId: 'c1',
  subcategoryId: null,
  isActive: true,
  previousPrice: null,
  discountPercent: null,
  hasDeliveryPromo: false,
  deliveryPromoAmount: 0,
  restockAt: null,
  options: [],
};

async function page(product: Product): Promise<string> {
  state.product = product;
  return renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: product.id }) }));
}
const card = (product: Product) => renderToStaticMarkup(createElement(ProductCard, { product }));

describe('pairOfferLabel', () => {
  it('names the two-piece price, and nothing without an offer', () => {
    expect(pairOfferLabel(7000)).toBe('قطعتان بـ7000 د.ع');
    expect(pairOfferLabel(null)).toBeNull();
    expect(pairOfferLabel(undefined)).toBeNull();
  });
});

describe('[CRITICAL] coming soon — price not announced', () => {
  const unpriced = { ...base, price: null, stock: 0 };

  it('product page: the notice, no price figure, no add-to-cart', async () => {
    const html = await page(unpriced);
    expect(html).toContain(PRICE_COMING_SOON);
    expect(html).not.toContain('د.ع');
    expect(html).not.toContain('data-add-to-cart');
  });

  it('card: the notice instead of a price, and no stock state for something not on sale', () => {
    const html = card(unpriced);
    expect(html).toContain(PRICE_COMING_SOON);
    expect(html).not.toContain('د.ع');
    expect(html).not.toContain('نفدت الكمية');
  });

  it('a priced product keeps its price and add-to-cart', async () => {
    const html = await page(base);
    expect(html).toContain('4000 د.ع');
    expect(html).toContain('data-add-to-cart');
    expect(html).not.toContain(PRICE_COMING_SOON);
  });
});

describe('two pieces for one price', () => {
  it('product page and card name the offer; without one there is no offer line', async () => {
    const offer = { ...base, pairPrice: 7000 };
    expect(await page(offer)).toContain('قطعتان بـ7000 د.ع بدل 8000 د.ع');
    expect(card(offer)).toContain('قطعتان بـ7000 د.ع');
    expect(await page(base)).not.toContain('قطعتان');
    expect(card(base)).not.toContain('قطعتان');
  });
});
