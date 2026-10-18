import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prefetching stays off site-wide (see `Link.tsx`): every prefetched link is
 * a server render, i.e. API calls against the shopper's rate limit. Only the
 * wrapper may import `next/link`, and nothing calls `router.prefetch`.
 */

const SRC = path.resolve(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('no prefetching', () => {
  it('only components/Link.tsx imports next/link', () => {
    const offenders = sources(SRC)
      .filter((file) => !file.endsWith(path.join('components', 'Link.tsx')))
      .filter((file) => /from\s+['"]next\/link['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('the wrapper forces prefetch off, after any caller props', () => {
    const wrapper = readFileSync(path.join(SRC, 'components', 'Link.tsx'), 'utf8');
    expect(wrapper).toMatch(/<NextLink \{\.\.\.props\} prefetch=\{false\} \/>/);
  });

  it('nothing prefetches programmatically', () => {
    const offenders = sources(SRC)
      .filter((file) => /\.prefetch\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
