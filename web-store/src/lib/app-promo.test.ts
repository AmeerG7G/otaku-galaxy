import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppPromoBanner } from '@/components/AppPromoBanner';
import { APP_PROMO_DEFAULTS, toAppPromo } from './app-promo';

const PLAY = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

/** The src of the one image inside the phone frame's screen, or null when there is no phone. */
function phoneScreen(html: string): string | null {
  return (
    html.match(
      /<div class="app-promo__phone" aria-hidden="true"><div class="app-promo__device"><div class="app-promo__screen"><img src="([^"]+)" width="480" height="1039" alt=""/,
    )?.[1] ?? null
  );
}

describe('toAppPromo — the admin promotion reaches the page only as a Play listing of the production app', () => {
  it('an enabled promotion keeps its texts, link and style', () => {
    expect(toAppPromo({ title: 'حمّل تطبيقنا', subtitle: 'أسرع', cta: 'نزّله', url: `${PLAY}&hl=ar`, style: 'night' })).toEqual({
      title: 'حمّل تطبيقنا',
      subtitle: 'أسرع',
      cta: 'نزّله',
      url: PLAY,
      style: 'night',
      image: null,
    });
  });

  it("the admin's image: only an upload reference, resolved against the media origin", () => {
    const base = { title: '', subtitle: '', cta: '', url: PLAY, style: 'night' };
    const image = '/uploads/banner/2026/11/0b6f3c1e-8a4d-4f7e-9c2a-5d1e7b9a3f10.webp';
    expect(toAppPromo({ ...base, imageUrl: image }, 'https://api.example')!.image).toBe(`https://api.example${image}`);
    for (const bad of [
      null,
      '',
      'https://evil.example/promo.png',
      '//evil.example/uploads/banner/a.png',
      'javascript:alert(1)',
      '/uploads/../x.png',
      '/uploads/banner/a.svg',
    ]) {
      expect(toAppPromo({ ...base, imageUrl: bad }, 'https://api.example')!.image, String(bad)).toBeNull();
    }
    // No media origin known: no image (the phone stays).
    expect(toAppPromo({ ...base, imageUrl: image })!.image).toBeNull();
  });

  it('empty texts fall back to the defaults; an unknown style is violet', () => {
    expect(toAppPromo({ title: '', subtitle: '  ', cta: '', url: PLAY, style: 'neon' })).toEqual({ ...APP_PROMO_DEFAULTS, url: PLAY, style: 'violet', image: null });
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
    expect(phoneScreen(html)).toBe('/app-promo/app-home-ar.webp');
  });

  it('the uploaded image is shown inside the phone screen; the frame, link and badge stay', () => {
    const image = '/uploads/banner/2026/11/promo.webp';
    const promo = toAppPromo({ title: '', subtitle: '', cta: '', url: PLAY, style: 'night', imageUrl: image }, 'https://api.example')!;
    const html = renderToStaticMarkup(createElement(AppPromoBanner, { promo }));
    expect(phoneScreen(html)).toBe('https://api.example/uploads/banner/2026/11/promo.webp');
    expect(html).not.toContain('/app-promo/app-home-ar.webp');
    expect(html).not.toContain('app-promo--art');
    expect(html).not.toContain('app-promo__art');
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(`href="${PLAY}"`);
    expect(html).toContain('src="/app-promo/google-play-badge-ar.png"');
  });

  it('replacing the image again and again only ever changes the screen', () => {
    // Everything but the image sources (and React's matching preload hints).
    const frame = (html: string) => html.replace(/ (src|href)="[^"]*\.(png|jpe?g|webp)"/g, '');
    const render = (imageUrl: unknown) =>
      renderToStaticMarkup(
        createElement(AppPromoBanner, {
          promo: toAppPromo({ title: '', subtitle: '', cta: '', url: PLAY, style: 'violet', imageUrl }, 'https://api.example')!,
        }),
      );
    const builtIn = render(null);
    for (const name of ['a.jpg', 'b.png', 'c.webp', 'd.jpeg']) {
      const html = render(`/uploads/banner/2026/11/${name}`);
      expect(phoneScreen(html)).toBe(`https://api.example/uploads/banner/2026/11/${name}`);
      expect(frame(html)).toBe(frame(builtIn));
    }
    // Removed again: back to the built-in screenshot, same frame.
    expect(render('')).toBe(builtIn);
  });

  it('a missing or invalid image keeps the phone with the built-in screen', () => {
    for (const imageUrl of [undefined, null, '', 'https://evil.example/a.png', '/uploads/banner/a.svg', 'javascript:alert(1)', 42]) {
      const promo = toAppPromo({ title: '', subtitle: '', cta: '', url: PLAY, style: 'night', imageUrl }, 'https://api.example')!;
      const html = renderToStaticMarkup(createElement(AppPromoBanner, { promo }));
      expect(phoneScreen(html), String(imageUrl)).toBe('/app-promo/app-home-ar.webp');
    }
  });
});

describe('the phone frame in globals.css', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');
  const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

  it('the screen clips its image to its rounded corners in a fixed phone-screen box', () => {
    expect(rule('.app-promo__screen')).toMatch(/overflow: hidden/);
    expect(rule('.app-promo__screen')).toMatch(/border-radius: /);
    const img = rule('.app-promo__screen img');
    expect(img).toMatch(/aspect-ratio: 480 \/ 1039/);
    expect(img).toMatch(/object-fit: cover/);
    expect(img).toMatch(/width: 100%/);
  });

  it('no rule swaps the phone for a bare image any more', () => {
    expect(css).not.toContain('app-promo--art');
    expect(css).not.toContain('app-promo__art');
  });
});
