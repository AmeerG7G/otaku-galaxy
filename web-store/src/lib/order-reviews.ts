import type { Order, Review } from './types';

/**
 * What each product of an order needs for its review, from the API's own
 * answers: `canReview` (receipt confirmed) on the order and the customer's
 * reviews (`GET /reviews`). One review per product, whatever order or colour —
 * so a product bought in two colours appears once. A product deleted from the
 * catalog (no `productId`) cannot be reviewed.
 */
export type ReviewSlot =
  | { productId: string; productName: string; state: 'open' }
  | { productId: string; productName: string; state: 'pending' | 'approved'; review: Review }
  | { productId: string; productName: string; state: 'rejected'; review: Review };

export function reviewSlots(order: Pick<Order, 'items' | 'canReview'>, mine: Review[]): ReviewSlot[] {
  if (!order.canReview) return [];
  const byProduct = new Map(mine.map((review) => [review.productId, review]));
  const seen = new Set<string>();
  const slots: ReviewSlot[] = [];
  for (const item of order.items) {
    if (!item.productId || seen.has(item.productId)) continue;
    seen.add(item.productId);
    const review = byProduct.get(item.productId);
    if (!review) slots.push({ productId: item.productId, productName: item.productName, state: 'open' });
    else if (review.status === 'rejected') slots.push({ productId: item.productId, productName: item.productName, state: 'rejected', review });
    else slots.push({ productId: item.productId, productName: item.productName, state: review.status, review });
  }
  return slots;
}
