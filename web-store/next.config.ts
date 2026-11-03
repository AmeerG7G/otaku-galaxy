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

/**
 * Crawlers that get each page's metadata (title, description, canonical,
 * robots) inside `<head>` instead of streamed after it. This is Next's own
 * default list (`next/dist/shared/lib/router/utils/html-bots`) plus
 * `Googlebot`, which the default leaves out because Google renders scripts.
 * Without it, a page whose metadata waits on the API — a category's
 * `noindex` while it is empty — reached Google only in the body. Shoppers
 * keep streaming. Setting this replaces Next's list, so `seo.test.ts` checks
 * it still contains every default entry after an upgrade.
 */
export const HTML_LIMITED_BOTS =
  /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  htmlLimitedBots: HTML_LIMITED_BOTS,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/bff/:path+', headers: [{ key: 'Content-Security-Policy', value: bffPolicy }] },
    ];
  },
};

export default nextConfig;
