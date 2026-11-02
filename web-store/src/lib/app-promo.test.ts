import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppPromoBanner } from '@/components/AppPromoBanner';
import { APP_PROMO_DEFAULTS, toAppPromo } from './app-promo';

const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

describe('toAppPromo — the admin promotion reaches the page only as a Play listing of the production app', () => {
  it('an enabled promotion keeps its texts, link and style', () => {
    expect(toAppPromo({ title: 'حمّل تطبيقنا', subtitle: 'أسرع', cta: 'نزّله', url: `${PLAY}&hl=ar`, style: 'night' })).toEqual({
      title: 'حمّل تطبيقنا',
      subtitle: 'أسرع',
      cta: 'نزّله',
      url: PLAY,
      style: 'night',
    });
  });

  it('empty texts fall back to the defaults; an unknown style is violet', () => {
    expect(toAppPromo({ title: '', subtitle: '  ', cta: '', url: PLAY, style: 'neon' })).toEqual({ ...APP_PROMO_DEFAULTS, url: PLAY, style: 'violet' });
    expect(APP_PROMO_DEFAULTS.cta).toBe('حمّل التطبيق الآن');
  });

  it('off (null), missing, or any other destination: hidden', () => {
    for (const raw of [
      null,
      undefined,
      'yes',
      {},
      { url: '' },
      { url: 'https://otakugalaxystore.com/otaku-galaxy.apk' },
      { url: 'https://apps.apple.com/app/id123' },
      { url: `${PLAY}.staging` },
      { url: 'https://play.google.com/store/apps/details?id=com.example.other' },
      { url: 'javascript:alert(1)' },
    ]) {
      expect(toAppPromo(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('AppPromoBanner', () => {
  it('one link to the listing in a new tab, safe rel, escaped admin text, no tracking', () => {
    const promo = toAppPromo({ title: '<script>alert(1)</script>', subtitle: '', cta: '', url: PLAY, style: 'violet' })!;
    const html = renderToStaticMarkup(createElement(AppPromoBanner, { promo }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`href="${PLAY}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('حمّل التطبيق الآن');
    expect(html).not.toMatch(/onclick|ping=/i);
  });

  it("artwork is local only: Google's badge inside the link, the app screenshot decorative", () => {
    const promo = toAppPromo({ title: '', subtitle: '', cta: '', url: PLAY, style: 'night' })!;
    const html = renderToStaticMarkup(createElement(AppPromoBanner, { promo }));
    const images = [...html.matchAll(/<img [^>]*>/g)].map(([tag]) => tag);
    expect(images).toHaveLength(2);
    for (const tag of images) {
      expect(tag).toMatch(/ src="\/app-promo\/[a-z-]+\.(png|webp)"/);
      expect(tag).toMatch(/ width="\d+" height="\d+"/);
    }
    const link = html.slice(html.indexOf('<a '), html.indexOf('</a>'));
    expect(link).toContain('src="/app-promo/google-play-badge-ar.png"');
    expect(link).toContain('alt="احصل عليه من Google Play"');
    expect(html).toMatch(/<div class="app-promo__phone" aria-hidden="true">[\s\S]*alt=""/);
  });
});
