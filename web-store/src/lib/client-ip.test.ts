import { describe, expect, it } from 'vitest';
import { clientIpFromHeaders, signedClientIpHeaders } from './client-ip';

describe('clientIpFromHeaders', () => {
  const from = (headers: Record<string, string>) => clientIpFromHeaders(new Headers(headers));

  it('prefers nginx X-Real-IP, then the right-most X-Forwarded-For entry', () => {
    expect(from({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })).toBe('203.0.113.7');
    // A shopper-supplied left entry is ignored: nginx appends the real peer last.
    expect(from({ 'x-forwarded-for': '1.2.3.4, 203.0.113.8' })).toBe('203.0.113.8');
    expect(from({ 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1');
  });

  it('ignores anything that is not an IP address', () => {
    expect(from({ 'x-real-ip': 'evil', 'x-forwarded-for': 'also-evil' })).toBeNull();
    expect(from({ 'x-real-ip': '203.0.113.7, 198.51.100.1' })).toBeNull();
    expect(from({})).toBeNull();
  });
});

describe('signedClientIpHeaders', () => {
  it('produces exactly what the API verifies (vector from backend signClientIp)', () => {
    expect(signedClientIpHeaders('vector-secret-vector-secret-vector-secret', '203.0.113.7', 1_800_000_000)).toEqual({
      'X-OG-Client-IP': '203.0.113.7',
      'X-OG-Client-Signature': '1800000000.65a2ba8ac3a01a3efd6849fc47b1d0a72a0d06cfbd412ed0da372967948620fd',
    });
  });
});
