import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';
import { parseReviewInput } from '@/lib/review-input';
import type { Review } from '@/lib/types';

/** Correct and resend a rejected review. The API accepts only the caller's own rejected review. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return bffError(404, 'NOT_FOUND', 'التقييم غير موجود');
    const input = parseReviewInput(await readJsonBody(request));
    if (!input) return bffError(400, 'VALIDATION_ERROR', 'بيانات التقييم غير صالحة');
    const { data, message } = await apiFetch<Review>(`/reviews/${id}`, {
      method: 'PATCH',
      body: input,
      token: session!.token,
    });
    return bffJson(200, { data, message });
  });
}
