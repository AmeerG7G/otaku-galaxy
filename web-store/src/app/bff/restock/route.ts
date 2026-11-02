import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/**
 * «أعلمني عند توفره» — the whole product, or one sold-out colour (`variantId`,
 * migration 088). The API refuses an in-stock product or colour and keeps one
 * subscription per customer.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const productId = typeof body?.productId === 'string' ? body.productId : '';
    const variantId = body?.variantId == null ? null : typeof body.variantId === 'string' ? body.variantId : '';
    if (!isUuid(productId)) return bffError(404, 'NOT_FOUND', 'المنتج غير موجود');
    if (variantId !== null && !isUuid(variantId)) return bffError(404, 'NOT_FOUND', 'اللون المختار غير موجود لهذا المنتج');
    const { data, message } = await apiFetch<unknown>('/restock-subscriptions', {
      method: 'POST',
      body: variantId ? { productId, variantId } : { productId },
      token: session!.token,
    });
    return bffJson(200, { data, message });
  });
}
