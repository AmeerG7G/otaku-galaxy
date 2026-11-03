import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '../app/robots';
import { PRIVATE_PATHS } from './robots';

afterEach(() => vi.unstubAllEnvs());

const APP = path.resolve(__dirname, '../app');

/**
 * A private page says `noindex` in its static `metadata`. A public page may
 * still return `noindex` for one state (an empty category listing,
 * `c/[id]`) from `generateMetadata` — that is not a private page.
 */
const STATIC_NOINDEX = /export const metadata[^=]*=\s*\{[^}]*robots:\s*\{\s*index:\s*false/;

/** Route of every page.tsx under src/app, with whether it declares `index: false`. */
function pages(dir = APP): { route: string; noindex: boolean }[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    if (name !== 'page.tsx') return [];
    // Route groups — `(home)` — are folders only: they never appear in the URL.
    const route = '/' + path.relative(APP, dir).split(path.sep).filter((part) => !/^\(.+\)$/.test(part)).join('/');
    return [{ route: route === '/' ? '/' : route, noindex: STATIC_NOINDEX.test(readFileSync(full, 'utf8')) }];
  });
}

const disallowed = (route: string) => PRIVATE_PATHS.some((p) => route === p.replace(/\/$/, '') || route.startsWith(p.endsWith('/') ? p : `${p}/`));

describe('robots.txt', () => {
  it('allows the store and points crawlers at the canonical origin', () => {
    vi.stubEnv('SITE_ORIGIN', 'https://otakugalaxystore.com');
    const result = robots();
    expect(result.host).toBe('https://otakugalaxystore.com');
    expect(result.rules).toMatchObject({ userAgent: '*', allow: '/' });
  });

  it('every noindex page is disallowed, and every indexable page stays open', () => {
    const all = pages();
    expect(all.length).toBeGreaterThan(10);
    for (const { route, noindex } of all) {
      expect(disallowed(route), `${route} noindex=${noindex}`).toBe(noindex);
    }
  });

  it('the public catalogue and legal pages are never disallowed', () => {
    for (const route of ['/', '/p/[id]', '/c/[id]', '/categories', '/privacy-policy', '/delete-account']) {
      expect(disallowed(route), route).toBe(false);
    }
    expect(disallowed('/bff/cart')).toBe(true);
  });
});
