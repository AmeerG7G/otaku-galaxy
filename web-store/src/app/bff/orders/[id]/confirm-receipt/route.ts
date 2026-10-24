import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/** The customer confirms receipt (OUT_FOR_DELIVERY → COMPLETED). The API enforces ownership and the transition. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return bffError(404, 'NOT_FOUND', 'الطلب غير موجود');
    const { data, message } = await apiFetch<{ status: string }>(`/orders/${id}/confirm-receipt`, {
      method: 'POST',
      token: session!.token,
    });
    return bffJson(200, { data: { status: data.status }, message });
  });
}
