/**
 * Request-origin and redirect checks for the BFF.
 *
 * Cookie-authenticated state changes need CSRF protection. SameSite=Lax is a
 * baseline, not the guarantee: every mutating route also requires the
 * request to come from this site's own origin.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isMutating(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/**
 * True when a state-changing request provably originates from `siteOrigin`.
 *
 * Browsers send `Origin` on every cross-site POST and on same-origin fetches.
 * When it is absent we fall back to Fetch Metadata (`Sec-Fetch-Site`), and
 * when both are absent we refuse — fail closed.
 */
export function isSameOriginRequest(headers: Headers, siteOrigin: string): boolean {
  const origin = headers.get('origin');
  if (origin !== null) return origin === siteOrigin;
  const fetchSite = headers.get('sec-fetch-site');
  return fetchSite === 'same-origin';
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * A post-login destination that can only ever be a path on this site.
 * Anything else (absolute URLs, protocol-relative `//evil`, backslash
 * tricks, control characters, overly long values) becomes `/`.
 */
export function safeReturnTo(value: unknown, siteOrigin: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || CONTROL_CHARS.test(value)) return '/';
  try {
    const resolved = new URL(value, siteOrigin);
    if (resolved.origin !== siteOrigin) return '/';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return '/';
  }
}

/** Idempotency keys the API accepts (`orderController`, migration 071). */
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;
