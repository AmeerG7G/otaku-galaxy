import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/**
 * Every internal link on the site, with prefetching off.
 *
 * Next prefetches each `<Link>` that scrolls into view, and on this site
 * every page is rendered per request from the API with the shopper's signed
 * IP (`lib/api.ts`). A listing page full of product cards, category chips and
 * the bottom navigation therefore cost 11–32 API calls per view against that
 * shopper's rate limit — one person browsing could exhaust it, together with
 * everyone sharing their IP. Without prefetching a page view costs what the
 * page itself reads (one to three calls), like a screen in the app; a click
 * waits for one server render instead.
 *
 * Use this instead of `next/link` (a test enforces it).
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />;
}
