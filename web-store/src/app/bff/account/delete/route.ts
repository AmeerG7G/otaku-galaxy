import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { clearSession } from '@/lib/server-session';

/**
 * Delete the signed-in customer's account (STEP 78).
 *
 * The API needs the session's token AND the password typed now; it refuses
 * an order in progress and deletes in one transaction. Only `password` and
 * `reason` are forwarded. On success the browser session is dropped at once:
 * the API has already revoked the token.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) return bffError(400, 'VALIDATION_ERROR', 'أدخل كلمة المرور');
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;
    if (reason !== undefined && reason.length > 500) return bffError(400, 'VALIDATION_ERROR', 'السبب طويل — 500 حرف على الأكثر');

    const { data, message } = await apiFetch<{ reference: string; deletedAt: string; retainedOrders: number }>('/auth/me/delete', {
      method: 'POST',
      body: reason === undefined ? { password } : { password, reason },
      token: session!.token,
    });
    await clearSession();
    return bffJson(200, { data: { reference: data.reference, retainedOrders: data.retainedOrders }, message });
  });
}
