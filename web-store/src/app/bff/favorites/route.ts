import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/** Save a product to the customer's favourites — the same list the app shows, on every device. */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const productId = typeof body?.productId === 'string' ? body.productId : '';
    if (!isUuid(productId)) return bffError(404, 'NOT_FOUND', 'المنتج غير موجود');
    const { data } = await apiFetch<{ productId: string; favorite: boolean }>('/favorites', {
      method: 'POST',
      body: { productId },
      token: session!.token,
    });
    return bffJson(200, { data });
  });
}
