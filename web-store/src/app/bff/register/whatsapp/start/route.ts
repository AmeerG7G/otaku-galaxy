import { apiFetch } from '@/lib/api';
import { bffJson, handleBff, readJsonBody } from '@/lib/bff';
import { writeSignupCookie, type WhatsAppSignupCookie } from '@/lib/whatsapp-signup-cookie';

/**
 * Starts a WhatsApp sign-up session. The API's `secret` and session id stay in
 * the sealed httpOnly cookie; the page gets only what it shows (the code, the
 * wa.me link, the store number, the deadline).
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const body = (await readJsonBody(request)) ?? {};
    const { data } = await apiFetch<WhatsAppSignupCookie>('/auth/register/whatsapp/start', {
      method: 'POST',
      body: { phone: body.phone },
    });
    await writeSignupCookie({
      sessionId: data.sessionId,
      secret: data.secret,
      code: data.code,
      waLink: data.waLink,
      businessNumber: data.businessNumber,
      expiresAt: data.expiresAt,
    });
    return bffJson(201, {
      data: { code: data.code, waLink: data.waLink, businessNumber: data.businessNumber, expiresAt: data.expiresAt },
    });
  });
}
