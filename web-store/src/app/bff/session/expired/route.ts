import { NextResponse } from 'next/server';
import { siteOrigin } from '@/lib/config';
import { safeReturnTo } from '@/lib/security';
import { clearSession } from '@/lib/server-session';

/**
 * Where a page sends the visitor when the API rejected their token (see
 * `page-session.ts`). Drops the session cookie and continues to login. It only
 * ever signs the visitor out, so a cross-site link to it can do no more than
 * that; the destination is validated like every other `returnTo`.
 */
export async function GET(request: Request) {
  await clearSession();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'), siteOrigin());
  const target = new URL('/login', siteOrigin());
  target.searchParams.set('returnTo', returnTo);
  target.searchParams.set('expired', '1');
  return NextResponse.redirect(target, { status: 303, headers: { 'Cache-Control': 'no-store' } });
}
