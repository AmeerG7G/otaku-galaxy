import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';
import { parseReviewInput } from '@/lib/review-input';
import type { Review } from '@/lib/types';

/** Review a product of a received order. The API decides eligibility; a new review waits for moderation. */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    const productId = typeof body?.productId === 'string' ? body.productId : '';
    const input = parseReviewInput(body);
    if (!isUuid(orderId) || !isUuid(productId) || !input) return bffError(400, 'VALIDATION_ERROR', 'بيانات التقييم غير صالحة');
    const { data, message } = await apiFetch<Review>('/reviews', {
      method: 'POST',
      body: { orderId, productId, ...input },
      token: session!.token,
    });
    return bffJson(201, { data, message });
  });
}
