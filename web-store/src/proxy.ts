import { NextResponse, type NextRequest } from 'next/server';
import { extraImageOrigins, mediaOrigin } from '@/lib/config';

/**
 * A fresh script nonce and Content-Security-Policy for every page.
 *
 * Next.js reads the policy from the request header and puts the nonce on its
 * own scripts, so only scripts this server rendered can run. Every page is
 * rendered per request (the layout reads the session cookie), which nonces
 * require. Styles allow inline attributes: the risk there is small, and
 * nonce-only styles would break the framework's injected styles.
 *
 * Images: this site plus the API's media origin (`/uploads/...`), where
 * product images come from, plus any origin listed in `CSP_EXTRA_IMG_ORIGINS`
 * (e.g. the dev seed's placeholder host).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const media = mediaOrigin();
  const https = request.nextUrl.protocol === 'https:';

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    ['img-src', "'self'", 'data:', 'blob:', media, ...extraImageOrigins()].join(' '),
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the BFF's JSON, not static assets, not prefetches.
      source: '/((?!bff/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
