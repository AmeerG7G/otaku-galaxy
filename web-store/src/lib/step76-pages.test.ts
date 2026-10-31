import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionData } from './session';
import type { Order, PointsSummary, Product, Review } from './types';

/**
 * STEP 76 pages render the API's answers and nothing invented: favourite and
 * alert state only from `viewer` (D5), reviews only as approved and sent by
 * the API, review forms only where the API opened them, and the claim note
 * that a reward does not spend points.
 */

const state = vi.hoisted(() => ({
  session: null as SessionData | null,
  product: null as unknown,
  reviews: [] as unknown[],
  reads: {} as Record<string, unknown>,
}));
vi.mock('@/lib/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./catalog')>()),
  getProduct: async () => state.product,
  listProductReviews: async () => state.reviews,
}));
vi.mock('@/lib/server-session', () => ({ readSession: async () => state.session }));
vi.mock('@/lib/page-session', () => ({
  requireSession: async () => state.session,
  sessionRead: async (_session: unknown, path: string) => {
    if (!(path in state.reads)) throw new Error(`unexpected read ${path}`);
    return state.reads[path];
  },
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));
vi.mock('@/components/AddToCart', () => ({ AddToCart: () => createElement('button', { 'data-add-to-cart': '' }, 'add') }));

const { default: ProductPage } = await import('@/app/p/[id]/page');
const { default: PointsPage } = await import('@/app/points/page');
const { default: OrderPage } = await import('@/app/orders/[id]/page');

const ID = '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10';
const RED = '7b2f0e76-7d4c-4a54-9f86-0d6a2f1e9b11';
const BLUE = '8c3f0e76-7d4c-4a54-9f86-0d6a2f1e9b12';
const session: SessionData = { token: 't', exp: 4_000_000_000, user: { id: 'u1', username: 'زبون', phone: '+9647700000000' } };

const base: Product = {
  id: ID,
  name: 'حقيبة',
  description: '',
  price: 4000,
  stock: 0,
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
  rating: 4.5,
  reviewCount: 2,
};
const approved: Review = {
  id: 'r1',
  productId: ID,
  productName: 'حقيبة',
  rating: 5,
  comment: 'ممتازة',
  photoUrls: [],
  status: 'approved',
  rejectionReason: null,
  customerName: 'سارة',
  createdAt: '2026-10-01T10:00:00Z',
};

async function productHtml(product: Product, reviewsPage?: string) {
  state.product = product;
  return renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({ reviews: reviewsPage }) }));
}

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000/api');
  state.session = null;
  state.reviews = [];
  state.reads = {};
});

describe('product page', () => {
  it('a visitor sees the reviews and a login prompt — no favourite or alert controls', async () => {
    state.reviews = [approved];
    const html = await productHtml(base);
    expect(html).toContain('ممتازة');
    expect(html).toContain('سارة');
    expect(html).toContain('2 تقييم'.replace('2', (2).toLocaleString('ar-IQ')));
    expect(html).toContain('لنعلمك عند توفر المنتج نحتاج حسابك');
    expect(html).not.toContain('أضف إلى المفضلة');
    expect(html).not.toContain('أعلمني عند توفره');
  });

  it('a customer sees their own state from `viewer`', async () => {
    state.session = session;
    const html = await productHtml({ ...base, viewer: { isFavorite: true, restockSubscribed: true, restockVariantIds: [] } });
    expect(html).toContain('في المفضلة');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('بانتظار التوفر — إلغاء التنبيه');
  });

  it('a customer on an older API (no `viewer`) gets no guessed state', async () => {
    state.session = session;
    const html = await productHtml(base);
    expect(html).not.toContain('المفضلة');
    expect(html).not.toContain('أعلمني عند توفره');
    expect(html).not.toContain('لنعلمك عند توفر المنتج');
  });

  it('sold-out colours each offer their own alert; an in-stock product offers no product alert', async () => {
    state.session = session;
    const colour = (id: string, name: string, stock: number) => ({
      id,
      colorName: name,
      colorNameAr: name,
      colorNameCkb: null,
      colorHex: '#ff0000',
      imageUrl: '/uploads/product/x.png',
      stock,
      isActive: true,
      sortOrder: 0,
    });
    const html = await productHtml({
      ...base,
      stock: 3,
      variants: [colour(RED, 'أحمر', 0), colour(BLUE, 'أزرق', 3)],
      viewer: { isFavorite: false, restockSubscribed: false, restockVariantIds: [RED] },
    });
    expect(html).toContain('ألوان نفدت');
    expect(html).toContain('أحمر');
    expect(html).toContain('إلغاء التنبيه');
    expect(html).not.toContain('بانتظار التوفر — إلغاء التنبيه');
    expect(html.match(/restock-color"/g)).toHaveLength(1);
  });

  it('no reviews: the app\'s empty state; a next page only when the API returned one more', async () => {
    let html = await productHtml({ ...base, reviewCount: 0, rating: null });
    expect(html).toContain('لا توجد تقييمات لهذا المنتج بعد');
    expect(html).not.toContain('صفحات التقييمات');

    state.reviews = Array.from({ length: 11 }, (_, index) => ({ ...approved, id: `r${index}` }));
    html = await productHtml(base);
    expect(html.match(/class="card review"/g)).toHaveLength(10);
    expect(html).toContain(`/p/${ID}?reviews=2`);
  });
});

describe('points page', () => {
  it('shows the API\'s balance and ladder, a claim button only where claimable, and says points are not spent', async () => {
    state.session = session;
    const level = (key: string, number: number, requiredPoints: number) => ({
      key,
      number,
      requiredPoints,
      nameMale: `ذكر ${key}`,
      nameFemale: `أنثى ${key}`,
      nameNeutral: `محايد ${key}`,
      rewardKind: number === 1 ? ('none' as const) : ('discount' as const),
      reward: number === 1 ? '' : `خصم المستوى ${number}`,
    });
    const summary: PointsSummary = {
      balance: 120,
      activity: [{ id: 'a1', label: 'طلب مستلم', amount: 120, occurredAt: '2026-10-01T10:00:00Z' }],
      levels: [level('beginner', 1, 0), level('explorer', 2, 100), level('voyager', 3, 250)],
      level: level('explorer', 2, 100),
      nextLevel: level('voyager', 3, 250),
      pointsToNextLevel: 130,
      levelProgress: 0.13,
      rewards: [
        { levelKey: 'explorer', requiredPoints: 100, kind: 'discount', unlocked: true, claimed: false, consumed: false, claimedAt: null, consumedAt: null, fulfilledAt: null, claimable: true },
        { levelKey: 'voyager', requiredPoints: 250, kind: 'gift', unlocked: false, claimed: false, consumed: false, claimedAt: null, consumedAt: null, fulfilledAt: null, claimable: false },
      ],
    };
    state.reads = { '/points': summary, '/auth/me': { user: { id: 'u1', username: 'زبون', phone: '+9647700000000', role: 'customer', gender: 'female' } } };
    const html = renderToStaticMarkup(await PointsPage());
    expect(html).toContain((120).toLocaleString('ar-IQ'));
    expect(html).toContain('أنثى explorer');
    expect(html).toContain('تفعيل مزيّة المستوى لا يُنقص رصيد نقاطك');
    expect(html.match(/تفعيل الخصم|تفعيل الهدية/g)).toEqual(['تفعيل الخصم']);
    expect(html).toContain('طلب مستلم');
  });
});

describe('order page reviews', () => {
  const order = (patch: Partial<Order>): Order => ({
    id: ID,
    number: 'OG-1',
    status: 'COMPLETED',
    province: 'بغداد',
    zoneName: null,
    deliveryFee: 0,
    deliveryDiscount: 0,
    fullAddress: 'عنوان',
    phone: '+9647700000000',
    productsTotal: 4000,
    discount: 0,
    loyaltyDiscount: 0,
    total: 4000,
    createdAt: '2026-10-01T10:00:00Z',
    items: [{ productId: RED, productName: 'كوب', imageUrl: null, optionValue: null, price: 4000, quantity: 1, lineTotal: 4000 }],
    rejectionReason: null,
    deliveryNote: null,
    statusHistory: [],
    ...patch,
  });
  const render = async () => renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) }));

  it('before receipt: no form and the customer\'s reviews are not even read', async () => {
    state.session = session;
    state.reads = { [`/orders/${ID}`]: order({ status: 'OUT_FOR_DELIVERY', canReview: false }) };
    const html = await render();
    expect(html).not.toContain('إرسال التقييم');
    expect(html).toContain('أكّد استلام طلبك ليُفتح التقييم مباشرةً');
  });

  it('after receipt: a form for an unreviewed product, a resend form for a rejected one with its reason', async () => {
    state.session = session;
    state.reads = { [`/orders/${ID}`]: order({ canReview: true }), '/reviews': [] };
    expect(await render()).toContain('إرسال التقييم');

    state.reads['/reviews'] = [{ ...approved, productId: RED, status: 'rejected', rejectionReason: 'الصورة غير واضحة' }];
    const html = await render();
    expect(html).toContain('السبب: الصورة غير واضحة');
    expect(html).toContain('إعادة الإرسال');
  });

  it('a pending review shows its state, not a form', async () => {
    state.session = session;
    state.reads = { [`/orders/${ID}`]: order({ canReview: true }), '/reviews': [{ ...approved, productId: RED, status: 'pending' }] };
    const html = await render();
    expect(html).toContain('تقييمك قيد المراجعة');
    expect(html).not.toContain('إرسال التقييم');
  });
});
