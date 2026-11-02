import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/config';
import { PRIVATE_PATHS } from '@/lib/robots';

/**
 * robots.txt for the public store. Production is meant to be indexed: the
 * catalogue, product, category and legal pages stay open. Private pages
 * already carry `noindex` themselves; listing them here only saves crawl
 * budget. `/bff/` is the store's own API for the browser and is never content.
 *
 * Staging never serves this: its nginx answers /robots.txt with `Disallow: /`
 * and sends `X-Robots-Tag: noindex` on every response (deploy/nginx/staging-store.conf).
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    host: siteOrigin(),
  };
}
