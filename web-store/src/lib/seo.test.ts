import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonLd } from '@/components/JsonLd';
import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots';
import { HTML_LIMITED_BOTS } from '../../next.config';
import robots from '../app/robots';
import { PRIVATE_PATHS } from './robots';
import {
  breadcrumbJsonLd,
  categoryCanonical,
  homeCanonical,
  openGraph,
  organizationJsonLd,
  productAvailability,
  productCanonical,
  productDescription,
  productJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from './seo';
import { galleryImages } from './gallery';
import type { Product, ProductVariant } from './types';
import { customerVariants } from './variants';

/**
 * Search metadata describes the page and nothing more: canonical URLs drop
 * only what does not change the content, and structured data carries only
 * what the API sent and the page shows.
 */

afterEach(() => vi.unstubAllEnvs());

const ORIGIN = 'https://otakugalaxystore.com';
const ID = '38f181d8-c570-46d3-8c06-a2aa740c6764';

const product = (over: Partial<Product> = {}): Product => ({
  id: ID,
  name: 'بروشات قاتل الشياطين',
  description: 'بروشات قاتل الشياطين حجم 58مم بثلاث انماط مختلفه',
  price: 3000,
  pairPrice: null,
  stock: 5,
  images: [`https://api.otakugalaxystore.com/uploads/product/2026/11/a.jpg`],
  categoryId: 'd20bf102-00e0-43b3-ac22-344d4d25f9e2',
  subcategoryId: null,
  isActive: true,
  previousPrice: null,
  discountPercent: null,
  hasDeliveryPromo: false,
  deliveryPromoAmount: 0,
  restockAt: null,
  options: [],
  ...over,
});

describe('canonical paths', () => {
  it('home keeps only a later catalogue page', () => {
    expect(homeCanonical(1)).toBe('/');
    expect(homeCanonical(3)).toBe('/?page=3');
  });

  it('a category keeps its subcategory and page, never the sort', () => {
    expect(categoryCanonical('c1', { page: 1 })).toBe('/c/c1');
    expect(categoryCanonical('c1', { page: 2 })).toBe('/c/c1?page=2');
    expect(categoryCanonical('c1', { subcategoryId: 's1', page: 1 })).toBe('/c/c1?sub=s1');
    expect(categoryCanonical('c1', { subcategoryId: 's1', page: 4 })).toBe('/c/c1?sub=s1&page=4');
  });

  it('a product is its own path — review pages are the same product', () => {
    expect(productCanonical(ID)).toBe(`/p/${ID}`);
  });
});

describe('Product JSON-LD', () => {
  it('the offer is the displayed price in IQD with the page’s stock state', () => {
    const data = productJsonLd(ORIGIN, product(), { name: 'الاكسسوارات' });
    expect(data).toMatchObject({
      '@type': 'Product',
      name: 'بروشات قاتل الشياطين',
      url: `${ORIGIN}/p/${ID}`,
      category: 'الاكسسوارات',
      image: [`https://api.otakugalaxystore.com/uploads/product/2026/11/a.jpg`],
      offers: { '@type': 'Offer', price: '3000', priceCurrency: 'IQD', availability: 'https://schema.org/InStock' },
    });
  });

  it('[CRITICAL] no Offer at all while the price is not announced', () => {
    const data = productJsonLd(ORIGIN, product({ price: null }));
    expect(data).not.toHaveProperty('offers');
    expect(serializeJsonLd(data)).not.toMatch(/price/i);
  });

  it('sold out is out of stock — also with an announced restock date (nothing can be ordered yet)', () => {
    expect(productAvailability({ stock: 0 })).toBe('https://schema.org/OutOfStock');
    expect(productAvailability({ stock: -1 })).toBe('https://schema.org/OutOfStock');
    expect((productJsonLd(ORIGIN, product({ stock: 0, restockAt: '2026-12-01' })).offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/OutOfStock',
    );
  });

  it('[CRITICAL] no rating without approved reviews', () => {
    expect(productJsonLd(ORIGIN, product())).not.toHaveProperty('aggregateRating');
    expect(productJsonLd(ORIGIN, product({ rating: null, reviewCount: 0 }))).not.toHaveProperty('aggregateRating');
    expect(productJsonLd(ORIGIN, product({ rating: 4.5, reviewCount: 0 }))).not.toHaveProperty('aggregateRating');
    expect(productJsonLd(ORIGIN, product({ rating: null, reviewCount: 3 }))).not.toHaveProperty('aggregateRating');
    expect(productJsonLd(ORIGIN, product({ rating: 4.5, reviewCount: 2 })).aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: '4.5',
      reviewCount: '2',
      bestRating: '5',
      worstRating: '1',
    });
  });

  it('carries nothing the API did not send — no brand, sku, condition, shipping or return policy', () => {
    const keys = Object.keys(productJsonLd(ORIGIN, product(), { name: 'x' })).sort();
    expect(keys).toEqual(['@context', '@id', '@type', 'category', 'description', 'image', 'name', 'offers', 'url'].sort());
    const offer = productJsonLd(ORIGIN, product()).offers as Record<string, unknown>;
    expect(Object.keys(offer).sort()).toEqual(['@type', 'availability', 'price', 'priceCurrency', 'seller', 'url'].sort());
  });

  it('images are the page gallery’s: general images, then each shown colour’s image — once each', () => {
    const colour = (id: string, imageUrl: string, sortOrder: number, isActive = true): ProductVariant => ({
      id,
      colorName: id,
      colorNameAr: id,
      colorNameCkb: null,
      colorHex: null,
      imageUrl,
      stock: 1,
      isActive,
      sortOrder,
    }) as ProductVariant;
    const variants = [
      colour('blue', 'https://media/b.jpg', 2),
      colour('red', 'https://media/r.jpg', 1),
      colour('hidden', 'https://media/h.jpg', 0, false),
      colour('dup', 'https://media/a.jpg', 3),
      colour('blank', '  ', 4),
    ];
    // Colour images only (5 of 6 live products on 2026-11-03): still has images, in colour order, no inactive one.
    const colourOnly = product({ images: [], variants });
    expect(productJsonLd(ORIGIN, colourOnly).image).toEqual(['https://media/r.jpg', 'https://media/b.jpg', 'https://media/a.jpg']);
    // General images first; a colour image that is also a general image appears once, in the general place.
    const both = product({ images: ['https://media/a.jpg', 'https://media/g.jpg'], variants });
    expect(productJsonLd(ORIGIN, both).image).toEqual(['https://media/a.jpg', 'https://media/g.jpg', 'https://media/r.jpg', 'https://media/b.jpg']);
    // Exactly what the gallery on the page shows — never an image the page does not.
    expect(productJsonLd(ORIGIN, both).image).toEqual(galleryImages(both.images, customerVariants(both)));
  });

  it('an empty description and no images are left out, not filled in', () => {
    const data = productJsonLd(ORIGIN, product({ description: '  ', images: [] }));
    expect(data).not.toHaveProperty('description');
    expect(data).not.toHaveProperty('image');
    expect(productDescription(product({ description: '' }))).toBe('بروشات قاتل الشياطين — مجرة الأوتاكو');
    expect(productDescription(product({ description: 'x'.repeat(300) }))).toHaveLength(160);
    // An emoji at the cut stays whole: 159 letters + one emoji (2 UTF-16 units) is 160 code points.
    expect(productDescription(product({ description: `${'x'.repeat(159)}🔥 tail` }))).toBe(`${'x'.repeat(159)}🔥`);
  });
});

describe('site JSON-LD', () => {
  it('Organization lists social profiles only — a WhatsApp chat link is not one', () => {
    const data = organizationJsonLd(ORIGIN, { instagram: 'https://instagram.com/og', tiktok: null, whatsapp: 'https://wa.me/9647700000000' });
    expect(data).toMatchObject({ '@type': 'Organization', name: 'مجرة الأوتاكو', alternateName: 'Otaku Galaxy', url: `${ORIGIN}/`, logo: `${ORIGIN}/icon.png` });
    expect(data.sameAs).toEqual(['https://instagram.com/og']);
    expect(organizationJsonLd(ORIGIN, { instagram: null, tiktok: null, whatsapp: null })).not.toHaveProperty('sameAs');
  });

  it('WebSite names the store in Arabic, with no search action for a noindex search page', () => {
    const data = websiteJsonLd(ORIGIN);
    expect(data).toMatchObject({ '@type': 'WebSite', inLanguage: 'ar', url: `${ORIGIN}/` });
    expect(data).not.toHaveProperty('potentialAction');
  });

  it('BreadcrumbList numbers the crumbs and links the last one to the page itself', () => {
    const data = breadcrumbJsonLd(ORIGIN, [{ name: 'الرئيسية', path: '/' }, { name: 'الاكسسوارات', path: '/c/c1' }, { name: 'بروش' }], `/p/${ID}`);
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'الاكسسوارات', item: `${ORIGIN}/c/c1` },
      { '@type': 'ListItem', position: 3, name: 'بروش', item: `${ORIGIN}/p/${ID}` },
    ]);
  });
});

describe('[SECURITY] JSON-LD in the page', () => {
  it('a product name can never close the script element', () => {
    const hostile = productJsonLd(ORIGIN, product({ name: '</script><script>alert(1)</script>' }));
    const text = serializeJsonLd(hostile);
    expect(text).not.toContain('<');
    expect(JSON.parse(text).name).toBe('</script><script>alert(1)</script>');
  });

  it('carries the request’s CSP nonce and stays a non-executable data block', () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { nonce: 'abc123', data: websiteJsonLd(ORIGIN) }));
    expect(html).toMatch(/^<script type="application\/ld\+json" nonce="abc123">\{/);
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});

describe('Open Graph', () => {
  it('every page keeps the site name, Arabic-Iraq locale and a share image', () => {
    expect(openGraph()).toMatchObject({ siteName: 'مجرة الأوتاكو', locale: 'ar_IQ', type: 'website', images: [{ url: '/icon.png' }] });
    expect(openGraph({ images: [{ url: 'https://x/a.jpg' }] }).images).toEqual([{ url: 'https://x/a.jpg' }]);
  });
});

describe('robots.txt', () => {
  it('points at the sitemap on the canonical origin and keeps every private path closed', () => {
    vi.stubEnv('SITE_ORIGIN', ORIGIN);
    const result = robots();
    expect(result.sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS });
    for (const path of ['/bff/', '/account', '/cart', '/checkout', '/login', '/register', '/orders', '/search']) {
      expect(PRIVATE_PATHS).toContain(path);
    }
  });
});

describe('metadata in <head> for crawlers (`htmlLimitedBots`)', () => {
  it('keeps every crawler of Next’s default list and adds Googlebot', () => {
    for (const entry of HTML_LIMITED_BOT_UA_RE.source.split('|')) {
      expect(HTML_LIMITED_BOTS.source.split('|'), entry).toContain(entry);
    }
    expect(HTML_LIMITED_BOTS.flags).toContain('i');
    expect(HTML_LIMITED_BOTS.test('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(HTML_LIMITED_BOTS.test('Mozilla/5.0 (Linux; Android 6.0.1) Chrome/130 Mobile Safari/537.36 (compatible; Googlebot/2.1)')).toBe(true);
    expect(HTML_LIMITED_BOTS.test('Googlebot-Image/1.0')).toBe(true);
  });

  it('a shopper’s browser is not a limited bot — pages keep streaming', () => {
    expect(HTML_LIMITED_BOTS.test('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe(false);
    expect(HTML_LIMITED_BOTS.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});
