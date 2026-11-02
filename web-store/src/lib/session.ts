import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * The browser session: an AES-256-GCM sealed blob in an HttpOnly cookie.
 *
 * The API issues a 7-day bearer JWT at login. The storefront keeps it only
 * inside this sealed cookie, so page scripts can never read it (no
 * localStorage, no token in client components). Tampering breaks the GCM tag
 * and the session is simply absent. Expiry follows the JWT's own `exp`, and
 * the API still enforces revocation and suspension on every call.
 *
 * Format: `v1.<kid>.<iv>.<ciphertext>.<tag>` (base64url). `kid` lets keys
 * rotate: the first key seals, every configured key may open.
 */

export interface SessionUser {
  id: string;
  username: string;
  phone: string;
}

export interface SessionData {
  token: string;
  /** JWT expiry, seconds since epoch. */
  exp: number;
  user: SessionUser;
}

const VERSION = 'v1';
const IV_BYTES = 12;
// GCM accepts tags truncated down to 4 bytes unless the length is pinned, which
// would make a forged cookie far cheaper to find.
const TAG_BYTES = 16;

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 8);
}

export function seal(data: SessionData, keys: readonly Buffer[]): string {
  const key = keys[0];
  if (!key) throw new Error('No session sealing key configured.');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, keyId(key), iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

export function unseal(value: string | undefined | null, keys: readonly Buffer[], nowMs = Date.now()): SessionData | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  const [, kid, ivPart, ciphertextPart, tagPart] = parts as [string, string, string, string, string];
  const key = keys.find((candidate) => keyId(candidate) === kid);
  if (!key) return null;
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const data = JSON.parse(plaintext) as SessionData;
    if (typeof data.token !== 'string' || typeof data.exp !== 'number' || !data.user?.id) return null;
    if (data.exp * 1000 <= nowMs) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * The `exp` claim of a JWT, read WITHOUT verifying it. The storefront never
 * holds the signing secret and never trusts the token's contents for
 * authorization; the API verifies it on every request. `exp` only bounds the
 * cookie lifetime.
 */
export function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

export function cookieName(secure: boolean): string {
  // `__Host-` binds the cookie to this exact host, HTTPS only, Path=/, no
  // Domain — it cannot be set or shadowed by a subdomain.
  return secure ? '__Host-og_session' : 'og_session';
}
