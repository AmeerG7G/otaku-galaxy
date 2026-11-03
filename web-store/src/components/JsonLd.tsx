import { headers } from 'next/headers';
import { serializeJsonLd } from '@/lib/seo';

/** This request's CSP script nonce, set by `proxy.ts`. */
export async function cspNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined;
}

/**
 * Structured data for search engines. A JSON-LD block is data the browser
 * never runs, but it is still a `<script>` element, so it carries this
 * request's CSP nonce (`cspNonce`) like every other script — the policy stays
 * exactly as strict. Browsers hide `nonce` from the DOM after parsing, which
 * React would otherwise report as a hydration difference.
 */
export function JsonLd({ data, nonce }: { data: Record<string, unknown> | Record<string, unknown>[]; nonce: string | undefined }) {
  return <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
