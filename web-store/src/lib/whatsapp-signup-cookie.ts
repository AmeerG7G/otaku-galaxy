import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { secureCookies, sessionSealKeys } from './config';

/**
 * The WhatsApp sign-up session held by THIS browser (API `WHATSAPP_VERIFY_MODE=auto`).
 *
 * The API's `secret` is what authorizes `status` and `complete`; it must never
 * reach page JavaScript. It lives here, sealed (AES-256-GCM, same keys as the
 * session cookie) in an httpOnly cookie. The AAD differs from the session
 * cookie's, so one sealed value can never be replayed as the other.
 */
export interface WhatsAppSignupCookie {
  sessionId: string;
  secret: string;
  code: string;
  waLink: string;
  businessNumber: string;
  /** ISO time the API gave for the session's end. */
  expiresAt: string;
}

const VERSION = 'w1';
const AAD = Buffer.from('og-whatsapp-signup');
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** The API keeps a verified session completable for 15 minutes. */
const COMPLETE_WINDOW_SECONDS = 15 * 60;

const keyId = (key: Buffer) => createHash('sha256').update(key).digest('base64url').slice(0, 8);

export function sealSignup(data: WhatsAppSignupCookie, keys: readonly Buffer[]): string {
  const key = keys[0];
  if (!key) throw new Error('No session sealing key configured.');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [VERSION, keyId(key), iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function unsealSignup(value: string | undefined | null, keys: readonly Buffer[]): WhatsAppSignupCookie | null {
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
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]).toString('utf8');
    const data = JSON.parse(plaintext) as WhatsAppSignupCookie;
    if (typeof data.sessionId !== 'string' || typeof data.secret !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function signupCookieName(secure: boolean): string {
  return secure ? '__Host-og_wa_signup' : 'og_wa_signup';
}

export async function readSignupCookie(): Promise<WhatsAppSignupCookie | null> {
  const store = await cookies();
  return unsealSignup(store.get(signupCookieName(secureCookies()))?.value, sessionSealKeys());
}

export async function writeSignupCookie(data: WhatsAppSignupCookie): Promise<void> {
  const store = await cookies();
  const untilExpiry = Math.floor((Date.parse(data.expiresAt) - Date.now()) / 1000);
  store.set(signupCookieName(secureCookies()), sealSignup(data, sessionSealKeys()), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, untilExpiry + COMPLETE_WINDOW_SECONDS),
  });
}

export async function clearSignupCookie(): Promise<void> {
  const store = await cookies();
  store.set(signupCookieName(secureCookies()), '', { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/', maxAge: 0 });
}
