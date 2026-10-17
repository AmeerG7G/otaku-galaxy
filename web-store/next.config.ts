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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
