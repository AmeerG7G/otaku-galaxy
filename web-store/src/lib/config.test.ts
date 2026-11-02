import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiBaseUrl, mediaOrigin, secureCookies, siteOrigin } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('apiBaseUrl', () => {
  it('uses the configured API without a trailing slash', () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4001/api/');
    expect(apiBaseUrl()).toBe('http://127.0.0.1:4001/api');
  });

  it('falls back to the local dev API outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('API_INTERNAL_URL', '');
    expect(apiBaseUrl()).toBe('http://127.0.0.1:4000/api');
  });

  // 127.0.0.1:4000 is the production API's port (deploy/README.md). A staging
  // site started without API_INTERNAL_URL used to serve production's catalog,
  // cart and orders under the staging domain.
  it('fails closed in production instead of reaching the production API', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_INTERNAL_URL', '');
    expect(() => apiBaseUrl()).toThrow(/API_INTERNAL_URL is required/);
    expect(() => mediaOrigin()).toThrow(/API_INTERNAL_URL is required/);
    for (const value of ['127.0.0.1:4001/api', 'ftp://127.0.0.1/api', 'http://user:pw@127.0.0.1:4001/api', 'http://127.0.0.1:4001/api?x=1']) {
      vi.stubEnv('API_INTERNAL_URL', value);
      expect(() => apiBaseUrl(), value).toThrow(/API_INTERNAL_URL must be/);
    }
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4001/api');
    expect(apiBaseUrl()).toBe('http://127.0.0.1:4001/api');
  });
});

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
