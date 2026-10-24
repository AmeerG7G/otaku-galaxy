import { bffJson, handleBff } from '@/lib/bff';
import { clearSession } from '@/lib/server-session';

/**
 * Logout ends the browser session. The API has no per-session revocation yet
 * (tokens are revoked only by a password change or suspension), so the token
 * is simply dropped with the cookie — it was never readable by page scripts.
 */
export async function POST(request: Request) {
  return handleBff(request, { auth: false }, async () => {
    await clearSession();
    return bffJson(200, { data: { loggedOut: true } });
  });
}
