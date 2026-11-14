import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { jwtExpiry } from '@/lib/session';
import { writeSession } from '@/lib/server-session';
import type { PublicUser } from '@/lib/types';
import { clearSignupCookie, readSignupCookie } from '@/lib/whatsapp-signup-cookie';

/**
 * Completes a VERIFIED WhatsApp sign-up: name, gender and password go to the
 * API only now, with the cookie's secret. The answer is the login contract
 * (`{token, user}`), so the storefront session starts exactly as after login —
 * customers only.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const signup = await readSignupCookie();
    if (!signup) return bffError(404, 'SESSION_NOT_FOUND', 'جلسة التحقق غير موجودة — ابدأ من جديد');
    const body = (await readJsonBody(request)) ?? {};
    const { data } = await apiFetch<{ token: string; user: PublicUser }>('/auth/register/whatsapp/complete', {
      method: 'POST',
      body: {
        sessionId: signup.sessionId,
        secret: signup.secret,
        username: body.username,
        gender: body.gender,
        password: body.password,
      },
    });
    await clearSignupCookie();
    if (data.user.role !== 'customer') {
      return bffError(403, 'WEB_CUSTOMERS_ONLY', 'حسابات الإدارة لا تُستعمل في المتجر — استعمل لوحة التحكم');
    }
    const exp = jwtExpiry(data.token);
    if (!exp) return bffError(502, 'UPSTREAM_ERROR', 'تعذّر بدء الجلسة — حاول مجدداً');
    await writeSession({ token: data.token, exp, user: { id: data.user.id, username: data.user.username, phone: data.user.phone } });
    return bffJson(201, { data: { user: { id: data.user.id, username: data.user.username } } });
  });
}
