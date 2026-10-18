import { describe, expect, it } from 'vitest';
import { IDEMPOTENCY_KEY, isMutating, isSameOriginRequest, safeReturnTo } from './security';

const SITE = 'https://otakugalaxystore.com';

describe('isSameOriginRequest (CSRF guard for mutating /bff routes)', () => {
  const check = (headers: Record<string, string>) => isSameOriginRequest(new Headers(headers), SITE);

  it('accepts this exact origin', () => {
    expect(check({ origin: SITE })).toBe(true);
  });

  it('rejects any other origin, including look-alikes and the www host', () => {
    for (const origin of [
      'https://evil.example',
      'https://www.otakugalaxystore.com',
      'http://otakugalaxystore.com',
      'https://otakugalaxystore.com.evil.example',
      'null',
    ]) {
      expect(check({ origin }), origin).toBe(false);
    }
  });

  it('falls back to Fetch Metadata, and fails closed without either', () => {
    expect(check({ 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(check({ 'sec-fetch-site': 'same-site' })).toBe(false);
    expect(check({ 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(check({})).toBe(false);
  });

  it('an explicit foreign Origin wins over a forged Sec-Fetch-Site', () => {
    expect(check({ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' })).toBe(false);
  });
});

describe('isMutating', () => {
  it('covers every state-changing method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) expect(isMutating(method)).toBe(true);
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(isMutating(method)).toBe(false);
  });
});

describe('safeReturnTo (open-redirect guard)', () => {
  it('keeps local paths with their query and hash', () => {
    expect(safeReturnTo('/checkout', SITE)).toBe('/checkout');
    expect(safeReturnTo('/c/abc?page=2#top', SITE)).toBe('/c/abc?page=2#top');
  });

  it('turns everything else into /', () => {
    for (const value of [
      '//evil.example',
      '//evil.example/path',
      '/\\evil.example',
      '\\\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'checkout',
      '/\u0000x',
      '/\nhttps://evil.example',
      '',
      `/${'a'.repeat(600)}`,
      undefined,
      null,
      42,
    ]) {
      expect(safeReturnTo(value, SITE), String(value)).toBe('/');
    }
  });

  it('checks the normalised result too: dot segments cannot produce //host', () => {
    for (const value of [
      '/.//evil.example',
      '/.//evil.example/login?x=1#y',
      '/a/..//evil.example',
      '/%2e//evil.example',
      '/%2E%2E//evil.example',
      '/..//evil.example',
      '/./%2e/..//evil.example',
    ]) {
      expect(safeReturnTo(value, SITE), value).toBe('/');
    }
    // Ordinary dot segments still resolve to a local path.
    expect(safeReturnTo('/c/../checkout', SITE)).toBe('/checkout');
    expect(safeReturnTo('/./orders', SITE)).toBe('/orders');
  });
});

describe('IDEMPOTENCY_KEY', () => {
  it('matches what the API accepts (migration 071)', () => {
    expect(IDEMPOTENCY_KEY.test('0f8fad5b-d9cb-469f-a165-70867728950e')).toBe(true);
    expect(IDEMPOTENCY_KEY.test('short')).toBe(false);
    expect(IDEMPOTENCY_KEY.test('a'.repeat(129))).toBe(false);
    expect(IDEMPOTENCY_KEY.test('has space in it 123')).toBe(false);
  });
});
