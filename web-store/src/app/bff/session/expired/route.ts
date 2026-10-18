import { NextResponse } from 'next/server';
import { ApiError, apiFetch } from '@/lib/api';
import { siteOrigin } from '@/lib/config';
import { safeReturnTo } from '@/lib/security';
import { clearSession, readSession } from '@/lib/server-session';

/**
 * Where a page sends the visitor when the API rejected their token (see
 * `page-session.ts`). Drops the session cookie and continues to login, with
 * the destination validated like every other `returnTo`.
 *
 * It is a GET, so any site can link to it. The cookie is therefore dropped
 * only when the API itself rejects the token (`/auth/me` sits behind the same
 * guard as every page read): a link from elsewhere cannot sign out a session
 * the API still accepts. Such a visitor simply continues to the destination.
 */
export async function GET(request: Request) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'), siteOrigin());
  const session = await readSession();
  if (session && !(await apiRejects(session.token))) {
    return NextResponse.redirect(new URL(returnTo, siteOrigin()), { status: 303, headers: { 'Cache-Control': 'no-store' } });
  }

  await clearSession();
  const target = new URL('/login', siteOrigin());
  target.searchParams.set('returnTo', returnTo);
  target.searchParams.set('expired', '1');
  return NextResponse.redirect(target, { status: 303, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * True only for the API's verdict on the token (expired, revoked, suspended).
 * An unreachable API keeps the session: the page then shows its error instead
 * of signing the shopper out.
 */
async function apiRejects(token: string): Promise<boolean> {
  try {
    await apiFetch('/auth/me', { token });
    return false;
  } catch (error) {
    return error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_SUSPENDED');
  }
}
