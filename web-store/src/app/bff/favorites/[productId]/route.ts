import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/** Remove a product from the customer's favourites. Removing one that is not there is not an error. */
export async function DELETE(request: Request, context: { params: Promise<{ productId: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { productId } = await context.params;
    if (!isUuid(productId)) return bffError(404, 'NOT_FOUND', 'المنتج غير موجود');
    const { data } = await apiFetch<{ productId: string; favorite: boolean }>(`/favorites/${productId}`, {
      method: 'DELETE',
      token: session!.token,
    });
    return bffJson(200, { data });
  });
}
