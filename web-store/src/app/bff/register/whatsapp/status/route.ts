import { ApiError, apiFetch } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';
import { clearSignupCookie, readSignupCookie } from '@/lib/whatsapp-signup-cookie';

const TERMINAL = new Set(['expired', 'mismatch', 'phone_taken', 'dead', 'completed']);

/** The session's state, as the API decides it — the page polls this. */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const signup = await readSignupCookie();
    if (!signup) return bffError(404, 'SESSION_NOT_FOUND', 'جلسة التحقق غير موجودة — ابدأ من جديد');
    try {
      const { data } = await apiFetch<{ status: string }>('/auth/register/whatsapp/status', {
        method: 'POST',
        body: { sessionId: signup.sessionId, secret: signup.secret },
      });
      if (data.status !== 'verified' && TERMINAL.has(data.status)) await clearSignupCookie();
      return bffJson(200, { data: { ...data, code: signup.code, waLink: signup.waLink, businessNumber: signup.businessNumber, expiresAt: signup.expiresAt } });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) await clearSignupCookie();
      throw error;
    }
  });
}
