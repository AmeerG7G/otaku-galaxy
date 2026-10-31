import { apiFetch } from '@/lib/api';
import { bffJson, handleBff } from '@/lib/bff';

/** Mark all of the customer's notifications read. */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { data } = await apiFetch<unknown>('/notifications/read-all', { method: 'POST', token: session!.token });
    return bffJson(200, { data });
  });
}
