import type { NextConfig } from 'next';

/**
 * Static security headers for every response. The Content-Security-Policy is
 * set per request in `src/proxy.ts` because it carries a fresh script nonce.
 * HSTS is added by the TLS terminator (nginx) once HTTPS is verified on the
 * domain — never from here, so local http development keeps working.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * `/bff/*` serves JSON, and the per-request CSP skips it (`proxy.ts` matcher).
 * Anything that still renders there (a framework 404 page) gets a policy that
 * allows nothing at all.
 */
const bffPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/bff/:path+', headers: [{ key: 'Content-Security-Policy', value: bffPolicy }] },
    ];
  },
};

export default nextConfig;
