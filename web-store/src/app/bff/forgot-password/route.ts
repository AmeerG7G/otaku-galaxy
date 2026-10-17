import { apiFetch } from '@/lib/api';
import { bffJson, handleBff, readJsonBody } from '@/lib/bff';

/**
 * Forgotten password → a request the admin resolves after a WhatsApp check.
 * The API answers the same way whether or not the phone exists.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    const body = (await readJsonBody(request)) ?? {};
    const { message } = await apiFetch<unknown>('/auth/forgot-password', {
      method: 'POST',
      body: {
        phone: body.phone,
        username: body.username,
        gender: body.gender,
        levelKey: body.levelKey,
      },
    });
    return bffJson(202, { message });
  });
}
