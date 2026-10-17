import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { IDEMPOTENCY_KEY } from '@/lib/security';
import type { Order } from '@/lib/types';

/**
 * Place the order (cash on delivery). Amounts are never sent: the API prices
 * the server cart itself. The browser sends the idempotency key issued with
 * the checkout page, so a retry after a lost response returns the SAME order
 * instead of an ambiguous "cart is empty" — and never creates a second one.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = (await readJsonBody(request)) ?? {};
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return bffError(400, 'INVALID_IDEMPOTENCY_KEY', 'أعد تحميل صفحة الدفع ثم حاول مجدداً');
    }

    const { data, message, headers } = await apiFetch<Order>('/orders', {
      method: 'POST',
      token: session!.token,
      idempotencyKey,
      body: {
        governorateId: body.governorateId,
        zoneId: body.zoneId ?? null,
        fullAddress: body.fullAddress,
        phone: body.phone,
        ...(Array.isArray(body.expectedPrices) ? { expectedPrices: body.expectedPrices } : {}),
        ...(typeof body.expectedQuote === 'string' ? { expectedQuote: body.expectedQuote } : {}),
      },
    });
    return bffJson(
      201,
      { data: { id: data.id, number: data.number }, message },
      headers.get('idempotency-replayed') ? { 'Idempotency-Replayed': 'true' } : undefined,
    );
  });
}
