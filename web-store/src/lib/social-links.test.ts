import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeHttpsUrl, toSocialLinks, whatsappHref, type SocialLinks } from './social-links';

/**
 * The footer's three social buttons (Instagram, TikTok, WhatsApp) come from
 * the dashboard's settings form through `/catalog/settings` on every request.
 * WhatsApp used to vanish: the dashboard suggests saving it as a number
 * (`+9647701234567`), and the site accepted `https://` links only.
 */

const apiFetch = vi.fn();
vi.mock('./api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { getSocialLinks } = await import('./catalog');
const { SiteFooter } = await import('@/components/SiteFooter');

describe('whatsappHref', () => {
  it('turns an international number into a wa.me link with no + or spaces', () => {
    expect(whatsappHref('+9647701234567')).toBe('https://wa.me/9647701234567');
    expect(whatsappHref('9647701234567')).toBe('https://wa.me/9647701234567');
    expect(whatsappHref(' +964 770 123 4567 ')).toBe('https://wa.me/9647701234567');
    expect(whatsappHref('00964-770-123-4567')).toBe('https://wa.me/9647701234567');
  });

  it('gives a local Iraqi mobile its country code, and refuses any other leading 0', () => {
    expect(whatsappHref('07701234567')).toBe('https://wa.me/9647701234567');
    expect(whatsappHref('0123456789')).toBeNull();
  });

  it('normalises a wa.me link and keeps its message', () => {
    expect(whatsappHref('https://wa.me/+9647701234567')).toBe('https://wa.me/9647701234567');
    expect(whatsappHref('https://wa.me/964%20770%20123%204567?text=hi')).toBe('https://wa.me/9647701234567?text=hi');
    expect(whatsappHref('https://wa.me/')).toBeNull();
  });

  it('keeps other https WhatsApp links as they are', () => {
    expect(whatsappHref('https://api.whatsapp.com/send?phone=9647701234567')).toBe(
      'https://api.whatsapp.com/send?phone=9647701234567',
    );
  });

  it('refuses empty, unsafe and malformed values', () => {
    for (const value of ['', '   ', null, undefined, 42, 'http://wa.me/9647701234567', 'javascript:alert(1)', '12345', 'abc']) {
      expect(whatsappHref(value), String(value)).toBeNull();
    }
  });
});

describe('safeHttpsUrl (Instagram, TikTok)', () => {
  it('keeps https profile links, query included', () => {
    expect(safeHttpsUrl('https://www.instagram.com/otakugalaxy')).toBe('https://www.instagram.com/otakugalaxy');
    expect(safeHttpsUrl(' https://www.tiktok.com/@otakugalaxy?_r=1 ')).toBe('https://www.tiktok.com/@otakugalaxy?_r=1');
  });

  it('refuses empty, http, scripts and relative paths', () => {
    for (const value of ['', null, 'http://instagram.com/x', 'javascript:alert(1)', '/instagram', 'instagram.com/x']) {
      expect(safeHttpsUrl(value), String(value)).toBeNull();
    }
  });
});

describe('getSocialLinks', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('returns all three as the dashboard saved them (WhatsApp as a number)', async () => {
    apiFetch.mockResolvedValue({
      data: {
        social: {
          tiktok: 'https://www.tiktok.com/@otakugalaxy',
          instagram: 'https://www.instagram.com/otakugalaxy',
          whatsapp: '+9647701234567',
          description: '',
        },
      },
    });
    expect(await getSocialLinks()).toEqual({
      tiktok: 'https://www.tiktok.com/@otakugalaxy',
      instagram: 'https://www.instagram.com/otakugalaxy',
      whatsapp: 'https://wa.me/9647701234567',
    });
    expect(apiFetch).toHaveBeenCalledWith('/catalog/settings');
  });

  it('an empty field drops only its own link', async () => {
    apiFetch.mockResolvedValue({ data: { social: { tiktok: '', instagram: 'https://www.instagram.com/otakugalaxy', whatsapp: '9647701234567' } } });
    expect(await getSocialLinks()).toEqual({
      tiktok: null,
      instagram: 'https://www.instagram.com/otakugalaxy',
      whatsapp: 'https://wa.me/9647701234567',
    });
  });

  it('a settings failure leaves the links out instead of breaking the page', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    expect(await getSocialLinks()).toEqual({ tiktok: null, instagram: null, whatsapp: null });
  });
});

describe('SiteFooter', () => {
  const ALL: SocialLinks = toSocialLinks({
    tiktok: 'https://www.tiktok.com/@otakugalaxy',
    instagram: 'https://www.instagram.com/otakugalaxy',
    whatsapp: '+9647701234567',
  });
  const render = (social: SocialLinks) => renderToStaticMarkup(createElement(SiteFooter, { playStore: null, social, theme: 'system' }));
  const anchors = (html: string) => [...html.matchAll(/<a [^>]*class="chip"[^>]*>.*?<\/a>/g)].map((match) => match[0]);

  it('shows all three buttons, each with its icon, opening safely in a new tab', () => {
    const links = anchors(render(ALL));
    expect(links).toHaveLength(3);
    for (const [href, label] of [
      ['https://wa.me/9647701234567', 'واتساب'],
      ['https://www.instagram.com/otakugalaxy', 'إنستغرام'],
      ['https://www.tiktok.com/@otakugalaxy', 'تيك توك'],
    ]) {
      const link = links.find((anchor) => anchor.includes(`href="${href}"`));
      expect(link, href).toBeDefined();
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toMatch(/<svg [^>]*aria-hidden="true"/);
      expect(link).toContain(label);
    }
  });

  it('an unset link hides only its own button', () => {
    for (const key of ['tiktok', 'instagram', 'whatsapp'] as const) {
      const links = anchors(render({ ...ALL, [key]: null }));
      expect(links, key).toHaveLength(2);
      for (const other of (['tiktok', 'instagram', 'whatsapp'] as const).filter((k) => k !== key)) {
        expect(links.some((anchor) => anchor.includes(`href="${ALL[other]}"`)), `${key} → ${other}`).toBe(true);
      }
    }
  });

  it('no configured link renders no social row at all', () => {
    expect(render({ tiktok: null, instagram: null, whatsapp: null })).not.toContain('social-links');
  });
});
