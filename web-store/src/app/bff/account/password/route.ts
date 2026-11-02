import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { jwtExpiry } from '@/lib/session';
import { clearSession, writeSession } from '@/lib/server-session';
import type { PublicUser } from '@/lib/types';

/**
 * Change the password while signed in. The API checks the current password,
 * revokes every other session of this account (token version) and returns a
 * NEW token — which is sealed into this browser's cookie at once, so this
 * device stays signed in and the old token is gone from it.
 */
export async function PATCH(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = await readJsonBody(request);
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) return bffError(400, 'VALIDATION_ERROR', 'أدخل كلمة المرور الحالية والجديدة');

    const { data, message } = await apiFetch<{ token: string; user: PublicUser }>('/auth/me/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
      token: session!.token,
    });
    const exp = jwtExpiry(data.token);
    if (!exp || data.user.role !== 'customer') {
      // The API already revoked the old token; keeping it in the cookie would only fail later.
      await clearSession();
      return bffError(502, 'UPSTREAM_ERROR', 'تغيّرت كلمة المرور — سجّل الدخول من جديد');
    }
    await writeSession({ token: data.token, exp, user: { id: data.user.id, username: data.user.username, phone: data.user.phone } });
    return bffJson(200, { data: { changed: true }, message });
  });
}
