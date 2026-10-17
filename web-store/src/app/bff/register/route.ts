import { apiFetch } from '@/lib/api';
import { bffJson, handleBff, readJsonBody } from '@/lib/bff';

/**
 * Account request (registration). The admin approves it after a WhatsApp
 * check — no SMS, no code, no session is created here.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const body = (await readJsonBody(request)) ?? {};
    const { message } = await apiFetch<unknown>('/auth/register', {
      method: 'POST',
      body: {
        username: body.username,
        phone: body.phone,
        password: body.password,
        gender: body.gender,
      },
    });
    return bffJson(202, { message });
  });
}
