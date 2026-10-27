import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductGallery } from '@/components/ProductGallery';
import { VariantSelectionProvider } from '@/components/VariantSelection';
import { galleryImages, stepIndex, SWIPE_MIN_PX, swipeStep } from './gallery';
import type { ProductVariant } from './types';

/**
 * The product page gallery (post-Staging c7bdff0 fix): the thumbnails used to be
 * inert `<img>`s without the first image, so the other uploaded images could
 * never reach the main slot. Clicking/swiping is measured in
 * `e2e/gallery.spec.ts`; this file pins the order, the bounds and the first
 * render.
 */

const images = ['http://api.test/uploads/product/front.png', 'http://api.test/uploads/product/back.png', 'http://api.test/uploads/product/detail.png'];
const red: ProductVariant = {
  id: 'red',
  colorName: 'أحمر',
  colorNameAr: 'أحمر',
  colorNameCkb: null,
  colorHex: '#E53935',
  imageUrl: 'http://api.test/uploads/product/red.png',
  stock: 2,
  isActive: true,
  sortOrder: 0,
};

const render = (list: string[], variants?: ProductVariant[]) => {
  const gallery = createElement(ProductGallery, { images: list, alt: 'هودي' });
  return renderToStaticMarkup(variants ? createElement(VariantSelectionProvider, { variants } as ComponentProps<typeof VariantSelectionProvider>, gallery) : gallery);
};
const srcs = (html: string) => [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((match) => match[1]);

describe('galleryImages', () => {
  it('keeps the API order and drops empty refs', () => {
    expect(galleryImages(images)).toEqual(images);
    expect(galleryImages(['', images[1]!, '  ', images[0]!])).toEqual([images[1], images[0]]);
    expect(galleryImages([])).toEqual([]);
  });

  it("puts the chosen colour's image first without repeating it", () => {
    expect(galleryImages(images, red.imageUrl)).toEqual([red.imageUrl, ...images]);
    expect(galleryImages(images, images[1])).toEqual([images[1], images[0], images[2]]);
    expect(galleryImages(images, null)).toEqual(images);
    expect(galleryImages(images, '')).toEqual(images);
  });
});

describe('stepIndex / swipeStep', () => {
  it('stops at the first and the last image — no wrap', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(5, 0, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it('a finger moving right goes to the next image (RTL); short or vertical moves do nothing', () => {
    expect(swipeStep(SWIPE_MIN_PX, 0)).toBe(1);
    expect(swipeStep(-SWIPE_MIN_PX, 0)).toBe(-1);
    expect(swipeStep(SWIPE_MIN_PX - 1, 0)).toBe(0);
    expect(swipeStep(60, 80)).toBe(0);
  });
});

describe('ProductGallery first render', () => {
  it('several images: the first is the main image, every image is a thumbnail button in order', () => {
    const html = render(images);
    const [main, ...thumbs] = srcs(html);
    expect(main).toBe(images[0]);
    expect(thumbs).toEqual(images);
    expect(html.match(/class="gallery__thumb"/g)).toHaveLength(3);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="هودي — صورة 1"[^>]*aria-current="true"/);
    expect(html).toMatch(/<button[^>]*gallery__nav--prev[^>]*disabled=""/);
    expect(html).not.toMatch(/<button[^>]*gallery__nav--next[^>]*disabled=""/);
  });

  it('one image: shown, with no navigation or thumbnails', () => {
    const html = render([images[1]!]);
    expect(srcs(html)).toEqual([images[1]]);
    expect(html).not.toContain('gallery__nav');
    expect(html).not.toContain('gallery__thumb');
  });

  it('no images: an empty slot, as before', () => {
    const html = render([]);
    expect(srcs(html)).toEqual([]);
    expect(html).toContain('gallery__main');
    expect(html).not.toContain('gallery__nav');
  });

  it("with colours: the pre-selected colour's image leads, the product's images follow", () => {
    const html = render(images, [red]);
    const [main, ...thumbs] = srcs(html);
    expect(main).toBe(red.imageUrl);
    expect(thumbs).toEqual([red.imageUrl, ...images]);
    expect(html).toContain('alt="هودي — أحمر"');
  });
});
