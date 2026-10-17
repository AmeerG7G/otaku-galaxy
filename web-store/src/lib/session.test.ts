import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cookieName, jwtExpiry, seal, unseal, type SessionData } from './session';

const keyA = randomBytes(32);
const keyB = randomBytes(32);
const now = Date.UTC(2026, 9, 17, 12, 0, 0);
const data: SessionData = {
  token: 'header.payload.signature',
  exp: Math.floor(now / 1000) + 3600,
  user: { id: '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10', username: 'زبون', phone: '+9647700000000' },
};

describe('sealed session cookie', () => {
  it('round-trips and never contains the token in clear', () => {
    const sealed = seal(data, [keyA]);
    expect(sealed).not.toContain(data.token);
    expect(sealed).not.toContain('payload');
    expect(unseal(sealed, [keyA], now)).toEqual(data);
  });

  it('uses a fresh IV every time', () => {
    expect(seal(data, [keyA])).not.toBe(seal(data, [keyA]));
  });

  it('rejects any tampering', () => {
    const sealed = seal(data, [keyA]);
    const parts = sealed.split('.');
    for (const index of [2, 3, 4]) {
      const tampered = [...parts];
      const segment = tampered[index]!;
      tampered[index] = `${segment.slice(0, -2)}${segment.endsWith('AA') ? 'BB' : 'AA'}`;
      expect(unseal(tampered.join('.'), [keyA], now), `segment ${index}`).toBeNull();
    }
    expect(unseal(`v2${sealed.slice(2)}`, [keyA], now)).toBeNull();
    expect(unseal('garbage', [keyA], now)).toBeNull();
    expect(unseal('', [keyA], now)).toBeNull();
    expect(unseal(undefined, [keyA], now)).toBeNull();
  });

  it('rejects an unknown key and supports rotation', () => {
    const sealed = seal(data, [keyA]);
    expect(unseal(sealed, [keyB], now)).toBeNull();
    // New key first (seals), old key still accepted (opens existing cookies).
    expect(unseal(sealed, [keyB, keyA], now)).toEqual(data);
    expect(seal(data, [keyB, keyA]).split('.')[1]).not.toBe(sealed.split('.')[1]);
  });

  it('expires with the JWT', () => {
    const sealed = seal(data, [keyA]);
    expect(unseal(sealed, [keyA], data.exp * 1000 - 1)).toEqual(data);
    expect(unseal(sealed, [keyA], data.exp * 1000)).toBeNull();
  });
});

describe('jwtExpiry', () => {
  const jwt = (payload: unknown) =>
    `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

  it('reads exp only', () => {
    expect(jwtExpiry(jwt({ sub: 'u', exp: 1_800_000_000 }))).toBe(1_800_000_000);
    expect(jwtExpiry(jwt({ sub: 'u' }))).toBeNull();
    expect(jwtExpiry(jwt({ exp: '1800000000' }))).toBeNull();
    expect(jwtExpiry('not-a-jwt')).toBeNull();
    expect(jwtExpiry('a.%%%.b')).toBeNull();
  });
});

describe('cookieName', () => {
  it('uses the __Host- prefix over HTTPS', () => {
    expect(cookieName(true)).toBe('__Host-og_session');
    expect(cookieName(false)).toBe('og_session');
  });
});
