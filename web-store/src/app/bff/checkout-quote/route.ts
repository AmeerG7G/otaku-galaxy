import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';
import type { CheckoutQuote } from '@/lib/types';

/**
 * The server's checkout figures for the current cart. The website never
 * computes a total: what is shown before confirming is exactly what the API
 * would persist now (`priceOrder`, shared with order creation).
 */
export async function GET(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const url = new URL(request.url);
    const governorateId = url.searchParams.get('governorateId');
    const zoneId = url.searchParams.get('zoneId');
    if (governorateId && !isUuid(governorateId)) return bffError(400, 'VALIDATION_ERROR', 'محافظة غير صالحة');
    if (zoneId && !isUuid(zoneId)) return bffError(400, 'VALIDATION_ERROR', 'منطقة غير صالحة');
    const { data } = await apiFetch<CheckoutQuote>('/orders/checkout-quote', {
      token: session!.token,
      query: { governorateId, zoneId },
    });
    return bffJson(200, { data });
  });
}
