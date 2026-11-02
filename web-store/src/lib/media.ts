/**
 * Turns an API media reference into a URL the browser can load.
 *
 * The API stores one relative representation (`/uploads/...`, migration 021)
 * and every client resolves it against the media origin it knows — the same
 * rule as the app's `resolveMediaUrl`. Absolute http(s) URLs pass through.
 * Anything else (javascript:, data:, protocol-relative) is dropped.
 */
export function resolveMediaUrl(reference: string | null | undefined, origin: string): string | null {
  const raw = reference?.trim();
  if (!raw) return null;
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
  if (raw.startsWith('/uploads/')) return `${origin.replace(/\/+$/, '')}${raw}`;
  return null;
}
