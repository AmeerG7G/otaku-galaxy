import { describe, expect, it } from 'vitest';
import { playStoreUrl } from './app-link';

describe('playStoreUrl — the Google Play link comes from the admin setting, and only a Play listing passes', () => {
  it('a Play listing is accepted and normalised to its id', () => {
    expect(playStoreUrl('https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy')).toBe(
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
    );
    expect(playStoreUrl('  https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy&hl=ar  ')).toBe(
      'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
    );
  });

  it('no setting yet, or anything that is not a Play listing, hides the link', () => {
    for (const value of [
      undefined,
      null,
      '',
      '   ',
      'not a url',
      'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
      'https://play.google.com.evil.example/store/apps/details?id=com.a.b',
      'https://evil.example/?https://play.google.com/store/apps/details?id=com.a.b',
      'https://play.google.com/store/apps/developer?id=Someone',
      'https://play.google.com/store/apps/details',
      'https://play.google.com/store/apps/details?id=javascript:alert(1)',
      'https://user@play.google.com/store/apps/details?id=com.a.b',
      'javascript:alert(1)',
      42,
    ]) {
      expect(playStoreUrl(value), String(value)).toBeNull();
    }
  });
});
