import { afterEach, describe, expect, it, vi } from 'vitest';
import { secureCookies, siteOrigin } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('siteOrigin', () => {
  it('normalises the value the way browsers send Origin', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://OtakuGalaxyStore.com:443/');
    expect(siteOrigin()).toBe('https://otakugalaxystore.com');
    expect(secureCookies()).toBe(true);
  });

  it('falls back to the local dev origin outside production', () => {
    vi.stubEnv('SITE_ORIGIN', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(siteOrigin()).toBe('http://127.0.0.1:3000');
  });

  it('fails closed in production: required, https, an origin only', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SITE_ORIGIN', '');
    expect(() => siteOrigin()).toThrow(/required/);
    vi.stubEnv('SITE_ORIGIN', 'http://otakugalaxystore.com');
    expect(() => siteOrigin()).toThrow(/https/);
    for (const value of ['https://otakugalaxystore.com/shop', 'https://otakugalaxystore.com?x=1', 'otakugalaxystore.com', 'ftp://otakugalaxystore.com']) {
      vi.stubEnv('SITE_ORIGIN', value);
      expect(() => siteOrigin(), value).toThrow(/origin/);
    }
    // A production build run on this machine (the end-to-end tests) keeps working.
    vi.stubEnv('SITE_ORIGIN', 'http://127.0.0.1:3000');
    expect(siteOrigin()).toBe('http://127.0.0.1:3000');
    expect(secureCookies()).toBe(false);
  });
});
