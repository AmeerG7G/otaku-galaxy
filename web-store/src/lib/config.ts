/**
 * Server-only configuration. Nothing here is ever sent to the browser: no
 * value uses the NEXT_PUBLIC_ prefix, and client components never import
 * this module.
 *
 * Values are read lazily (on first use), so `next build` does not need the
 * runtime secrets. In production a missing sealing key fails closed on the
 * first request instead of silently falling back.
 */

import { createHash } from 'node:crypto';

/** Development-only fallback: fixed so local sessions survive restarts. */
const DEV_SEAL_KEY = createHash('sha256').update('otaku-galaxy-web-store-development-only').digest();

function trimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * The API as reached from this server. Required in production: the
 * development fallback, 127.0.0.1:4000, is the production API's port on a
 * shared host (`deploy/README.md`), so a staging site started without the
 * variable silently served production's catalog, cart and orders.
 */
export function apiBaseUrl(): string {
  const raw = trimmed('API_INTERNAL_URL');
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API_INTERNAL_URL is required in production (e.g. http://127.0.0.1:4001/api for staging).');
    }
    return 'http://127.0.0.1:4000/api';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('API_INTERNAL_URL must be an http(s) URL such as http://127.0.0.1:4001/api.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search || url.hash) {
    throw new Error('API_INTERNAL_URL must be an http(s) URL such as http://127.0.0.1:4001/api.');
  }
  return stripTrailingSlash(raw);
}

/** Public origin that serves `/uploads/...` to browsers. */
export function mediaOrigin(): string {
  const explicit = trimmed('MEDIA_ORIGIN');
  if (explicit) return stripTrailingSlash(explicit);
  const api = apiBaseUrl();
  return api.endsWith('/api') ? api.slice(0, -'/api'.length) : api;
}

/**
 * Extra image origins for the Content-Security-Policy (`CSP_EXTRA_IMG_ORIGINS`,
 * space- or comma-separated). Only bare http(s) origins are accepted, so the
 * value can never smuggle another directive into the policy.
 */
export function extraImageOrigins(): string[] {
  return (trimmed('CSP_EXTRA_IMG_ORIGINS') ?? '')
    .split(/[\s,]+/)
    .filter((entry) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(entry));
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Canonical origin of this site — the only Origin mutating routes accept, and
 * what decides the `Secure`/`__Host-` cookie flags. Normalised the way browsers
 * send `Origin` (lower case, no default port, no path). Required in
 * production, and https there unless it is a loopback address (a production
 * build run locally, as the end-to-end tests do).
 */
export function siteOrigin(): string {
  const raw = trimmed('SITE_ORIGIN');
  const production = process.env.NODE_ENV === 'production';
  if (!raw) {
    if (production) throw new Error('SITE_ORIGIN is required in production.');
    return 'http://127.0.0.1:3000';
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SITE_ORIGIN must be an origin such as https://otakugalaxystore.com.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_ORIGIN must be an origin such as https://otakugalaxystore.com.');
  }
  if (production && url.protocol !== 'https:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('SITE_ORIGIN must use https in production.');
  }
  return url.origin;
}

export function secureCookies(): boolean {
  return siteOrigin().startsWith('https://');
}

/**
 * Shared with the API (`BFF_SHARED_SECRET`, same value on both sides) to sign
 * the shopper's IP. Required in production: without it every shopper lands
 * in one rate-limit bucket and the site locks itself out under load.
 */
export function bffSharedSecret(): string | null {
  const secret = trimmed('BFF_SHARED_SECRET');
  if (secret) {
    if (secret.length < 32) throw new Error('BFF_SHARED_SECRET must be at least 32 characters.');
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BFF_SHARED_SECRET is required in production.');
  }
  return null;
}

export function sessionSealKeys(): Buffer[] {
  const raw = trimmed('SESSION_SEAL_KEYS');
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SEAL_KEYS is required in production.');
    }
    return [DEV_SEAL_KEY];
  }
  const keys = raw.split(',').map((part) => Buffer.from(part.trim(), 'base64url'));
  for (const key of keys) {
    if (key.length !== 32) throw new Error('Each SESSION_SEAL_KEYS entry must decode to 32 bytes.');
  }
  return keys;
}
