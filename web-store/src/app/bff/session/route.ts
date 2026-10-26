import { apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { jwtExpiry } from '@/lib/session';
import { writeSession } from '@/lib/server-session';
import type { PublicUser } from '@/lib/types';

/**
 * Login. The API checks the credentials and the admin-approval gate
 * (ACCOUNT_PENDING_APPROVAL / ACCOUNT_REQUEST_REJECTED / ACCOUNT_SUSPENDED
 * pass through as-is). Only customer accounts may hold a storefront session:
 * an admin token must never be reachable from the public web origin.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const body = await readJsonBody(request);
    const phone = typeof body?.phone === 'string' ? body.phone : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!phone || !password) return bffError(400, 'VALIDATION_ERROR', 'أدخل رقم الهاتف وكلمة المرور');

    const { data } = await apiFetch<{ token: string; user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: { phone, password },
    });

    if (data.user.role !== 'customer') {
      return bffError(403, 'WEB_CUSTOMERS_ONLY', 'حسابات الإدارة لا تُستعمل في المتجر — استعمل لوحة التحكم');
    }
    const exp = jwtExpiry(data.token);
    if (!exp) return bffError(502, 'UPSTREAM_ERROR', 'تعذّر بدء الجلسة — حاول مجدداً');

    await writeSession({
      token: data.token,
      exp,
      user: { id: data.user.id, username: data.user.username, phone: data.user.phone },
    });
    return bffJson(200, { data: { user: { id: data.user.id, username: data.user.username } } });
  });
}
