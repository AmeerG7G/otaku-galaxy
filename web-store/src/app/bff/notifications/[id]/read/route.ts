import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { isUuid } from '@/lib/catalog';

/** Mark one of the customer's notifications read; returns the new unread count. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { id } = await context.params;
    if (!isUuid(id)) return bffError(404, 'NOT_FOUND', 'الإشعار غير موجود');
    const { data } = await apiFetch<{ id: string; unread: number }>(`/notifications/${id}/read`, {
      method: 'POST',
      token: session!.token,
    });
    return bffJson(200, { data });
  });
}
