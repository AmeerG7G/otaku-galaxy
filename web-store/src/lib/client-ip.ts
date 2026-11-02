import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * The shopper's IP, forwarded to the API so its rate limits stay per shopper.
 *
 * The API sees every storefront call coming from this server. Without this,
 * all web shoppers would share one rate-limit bucket (300 requests per 15
 * minutes for the whole site) and the login limit would lose its per-IP
 * half. The API accepts the forwarded IP only with a fresh HMAC made with
 * `BFF_SHARED_SECRET` (backend `middleware/client-ip.ts`, same algorithm).
 */

/**
 * The IP of the browser talking to this server, as reported by our own
 * nginx. This server listens on 127.0.0.1 only (`npm start`), so these
 * headers can only come from that proxy: `X-Real-IP` (`$remote_addr`), else
 * the right-most `X-Forwarded-For` entry (the one nginx appended). Anything
 * that is not a plain IP address is ignored.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim();
  if (real && isIP(real) !== 0) return real;
  const forwarded = headers.get('x-forwarded-for');
  const last = forwarded?.split(',').pop()?.trim();
  if (last && isIP(last) !== 0) return last;
  return null;
}

export function signedClientIpHeaders(secret: string, ip: string, nowSeconds = Math.floor(Date.now() / 1000)): Record<string, string> {
  const mac = createHmac('sha256', secret).update(`og-client-ip:v1\n${nowSeconds}\n${ip}`).digest('hex');
  return { 'X-OG-Client-IP': ip, 'X-OG-Client-Signature': `${nowSeconds}.${mac}` };
}
