import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/** Cancel an alert: the whole product, or one colour with `?variantId=`. Only the caller's own row goes. */
export async function DELETE(request: Request, context: { params: Promise<{ productId: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { productId } = await context.params;
    const variantId = new URL(request.url).searchParams.get('variantId');
    if (!isUuid(productId)) return bffError(404, 'NOT_FOUND', 'المنتج غير موجود');
    if (variantId !== null && !isUuid(variantId)) return bffError(404, 'NOT_FOUND', 'اللون المختار غير موجود لهذا المنتج');
    const { data } = await apiFetch<unknown>(`/restock-subscriptions/${productId}`, {
      method: 'DELETE',
      query: { variantId },
      token: session!.token,
    });
    return bffJson(200, { data });
  });
}
