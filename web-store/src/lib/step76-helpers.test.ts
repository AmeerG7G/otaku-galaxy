import { describe, expect, it } from 'vitest';
import { daysInMonth, monthName } from './birthday';
import { notificationHref } from './notifications';
import { reviewSlots } from './order-reviews';
import { claimLabel, isLevelKey, levelName, progressPercent, rewardStateLabel } from './points';
import { parseReviewInput } from './review-input';
import type { Level, OrderItem, Review, RewardState } from './types';

const P1 = '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10';
const P2 = '7b2f0e76-7d4c-4a54-9f86-0d6a2f1e9b11';
const P3 = '8c3f0e76-7d4c-4a54-9f86-0d6a2f1e9b12';

const item = (productId: string | null, productName = 'منتج'): OrderItem => ({
  productId,
  productName,
  imageUrl: null,
  optionValue: null,
  price: 1000,
  quantity: 1,
  lineTotal: 1000,
});
const review = (productId: string, status: Review['status']): Review => ({
  id: `r-${productId}`,
  productId,
  productName: 'منتج',
  rating: 4,
  comment: '',
  photoUrls: [],
  status,
  rejectionReason: status === 'rejected' ? 'الصورة غير واضحة' : null,
  customerName: 'زبون',
  createdAt: '2026-10-01T10:00:00Z',
});

describe('reviewSlots — one review per product, decided by the API', () => {
  it('nothing before receipt is confirmed', () => {
    expect(reviewSlots({ items: [item(P1)], canReview: false }, [])).toEqual([]);
    expect(reviewSlots({ items: [item(P1)] }, [])).toEqual([]);
  });

  it('a product bought in two colours is one slot; a deleted product none', () => {
    const slots = reviewSlots({ items: [item(P1), item(P1), item(null)], canReview: true }, []);
    expect(slots).toEqual([{ productId: P1, productName: 'منتج', state: 'open' }]);
  });

  it('pending and approved are final; rejected can be corrected', () => {
    const slots = reviewSlots({ items: [item(P1), item(P2), item(P3)], canReview: true }, [review(P1, 'pending'), review(P2, 'approved'), review(P3, 'rejected')]);
    expect(slots.map((slot) => slot.state)).toEqual(['pending', 'approved', 'rejected']);
  });
});

describe('parseReviewInput', () => {
  it('keeps rating, comment and upload references', () => {
    expect(parseReviewInput({ rating: 5, comment: 'جميل', photoUrls: ['/uploads/review/2026/10/x.webp'] })).toEqual({
      rating: 5,
      comment: 'جميل',
      photoUrls: ['/uploads/review/2026/10/x.webp'],
    });
    expect(parseReviewInput({ rating: 1 })).toEqual({ rating: 1, comment: '', photoUrls: [] });
  });

  it('refuses what the API would refuse anyway', () => {
    for (const body of [
      null,
      { rating: '5' },
      { rating: 6 },
      { rating: 3, comment: 7 },
      { rating: 3, photoUrls: 'x' },
      { rating: 3, photoUrls: ['javascript:alert(1)'] },
      { rating: 3, photoUrls: ['//evil.example/x.jpg'] },
      { rating: 3, photoUrls: ['/uploads/a/../../x'] },
    ]) {
      expect(parseReviewInput(body as Record<string, unknown> | null), JSON.stringify(body)).toBeNull();
    }
  });
});

describe('points display', () => {
  const level: Level = {
    key: 'explorer',
    number: 2,
    requiredPoints: 100,
    nameMale: 'مستكشف',
    nameFemale: 'مستكشفة',
    nameNeutral: 'مستكشف المجرّة',
    rewardKind: 'discount',
    reward: 'خصم ٣٪',
  };
  const reward = (patch: Partial<RewardState>): RewardState => ({
    levelKey: 'explorer',
    requiredPoints: 100,
    kind: 'discount',
    unlocked: true,
    claimed: false,
    consumed: false,
    claimedAt: null,
    consumedAt: null,
    fulfilledAt: null,
    claimable: true,
    ...patch,
  });

  it('level keys: the closed list is the API\'s; only the shape is checked here', () => {
    for (const key of ['beginner', 'explorer', 'legend']) expect(isLevelKey(key)).toBe(true);
    for (const key of ['', 'Legend', '../x', 'a-b', '1abc', 'x'.repeat(33)]) expect(isLevelKey(key), key).toBe(false);
  });

  it('level names follow the known gender and fall back to the neutral name', () => {
    expect(levelName(level, 'male')).toBe('مستكشف');
    expect(levelName(level, 'female')).toBe('مستكشفة');
    expect(levelName(level, null)).toBe('مستكشف المجرّة');
  });

  it('reward states use the app\'s words', () => {
    expect(rewardStateLabel(reward({}))).toBeNull();
    expect(rewardStateLabel(reward({ claimed: true }))).toBe('جاهز — تم تفعيل الخصم وسيطبق على طلبك القادم');
    expect(rewardStateLabel(reward({ claimed: true, consumed: true }))).toBe('طُبّق الخصم على طلبك');
    expect(rewardStateLabel(reward({ kind: 'gift', claimed: true }))).toBe('تم تفعيل الهدية وستصل مع طلبك القادم');
    expect(rewardStateLabel(reward({ kind: 'gift', claimed: true, consumed: true }))).toBe('سُلّمت الهدية');
    expect(claimLabel(reward({}))).toBe('تفعيل الخصم');
    expect(claimLabel(reward({ kind: 'gift' }))).toBe('تفعيل الهدية');
  });

  it('progress is the API\'s fraction, clamped', () => {
    expect(progressPercent(0.426)).toBe(43);
    expect(progressPercent(2)).toBe(100);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
  });
});

describe('notification links', () => {
  const base = { orderId: null, productId: null, reviewId: null, type: 'promotion' };
  it('open the order, then the product; rewards open the points page', () => {
    expect(notificationHref({ ...base, orderId: P1, productId: P2 })).toBe(`/orders/${P1}`);
    expect(notificationHref({ ...base, productId: P2, type: 'backInStock' })).toBe(`/p/${P2}`);
    expect(notificationHref({ ...base, type: 'rewardClaimed' })).toBe('/points');
    expect(notificationHref(base)).toBeNull();
  });

  it('never build a link from a malformed id', () => {
    expect(notificationHref({ ...base, orderId: '../admin', productId: 'javascript:x' })).toBeNull();
  });
});

describe('birthday', () => {
  it('29 February is a valid birthday; month names are the app\'s', () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(12)).toBe(31);
    expect(monthName(1)).toBe('يناير');
    expect(monthName(12)).toBe('ديسمبر');
  });
});
