import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductGallery } from '@/components/ProductGallery';
import { VariantSelectionProvider } from '@/components/VariantSelection';
import { colourImageIndex, coverImage, galleryImages, stepIndex, SWIPE_MIN_PX, swipeStep } from './gallery';
import type { ProductVariant } from './types';

/**
 * The product page gallery (post-Staging c7bdff0 fix): the thumbnails used to be
 * inert `<img>`s without the first image, so the other uploaded images could
 * never reach the main slot. Clicking/swiping is measured in
 * `e2e/gallery.spec.ts`; this file pins the order, the bounds and the first
 * render.
 *
 * Unified gallery (post-Staging 51eae0b), order changed by the owner on
 * 2026-11-02: the product's display images first (configured order, the first is
 * the main one), then every visible colour's image, once each — the chosen
 * colour only focuses its image, and browsing never chooses a colour.
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

const blue: ProductVariant = { ...red, id: 'blue', colorName: 'أزرق', colorNameAr: 'أزرق', imageUrl: 'http://api.test/uploads/product/blue.png', stock: 3, sortOrder: 1 };
const green: ProductVariant = { ...red, id: 'green', colorName: 'أخضر', colorNameAr: 'أخضر', imageUrl: 'http://api.test/uploads/product/green.png', isActive: false, sortOrder: 2 };

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

  it('every display image in its configured order, then every colour image in colour order, each once', () => {
    expect(galleryImages(images, [red, blue])).toEqual([...images, red.imageUrl, blue.imageUrl]);
    // One display image: it leads, the colours follow.
    expect(galleryImages([images[1]!], [red, blue])).toEqual([images[1], red.imageUrl, blue.imageUrl]);
    // A colour image also uploaded as a display image stays in the display image's place.
    expect(galleryImages([images[0]!, blue.imageUrl, images[1]!], [red, blue])).toEqual([images[0], blue.imageUrl, images[1], red.imageUrl]);
    expect(galleryImages([], [red, { ...blue, imageUrl: red.imageUrl }])).toEqual([red.imageUrl]);
    expect(galleryImages(images, [{ imageUrl: '' }, { imageUrl: '  ' }])).toEqual(images);
    expect(galleryImages(images, [red, blue])).toEqual(galleryImages(images, [red, blue]));
  });
});

describe('coverImage / colourImageIndex', () => {
  it('cards keep the first general image; a coloured product without one shows its first visible colour', () => {
    expect(coverImage({ images, variants: [red] })).toBe(images[0]);
    expect(coverImage({ images: [], variants: [blue, red] })).toBe(red.imageUrl);
    expect(coverImage({ images: [], variants: [{ ...red, isActive: false }, blue] })).toBe(blue.imageUrl);
    expect(coverImage({ images: [] })).toBeNull();
  });

  it("finds a colour's image in the gallery; none for no colour or a missing image", () => {
    const list = galleryImages(images, [red, blue]);
    expect(colourImageIndex(list, red)).toBe(3);
    expect(colourImageIndex(list, blue)).toBe(4);
    // Its image also uploaded as a display image: found in the display image's place.
    expect(colourImageIndex(galleryImages([images[0]!, blue.imageUrl], [red, blue]), blue)).toBe(1);
    expect(colourImageIndex(list, null)).toBeNull();
    expect(colourImageIndex(list, { imageUrl: 'http://api.test/uploads/other.png' })).toBeNull();
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

  it('with colours: the display images lead the thumbnails and the main display image opens the page', () => {
    // `green` is inactive — never shown. Red is out of stock, so blue is pre-selected (the store's existing rule),
    // but the page still opens on the main display image.
    const html = render(images, [{ ...red, stock: 0 }, blue, green]);
    const [main, ...thumbs] = srcs(html);
    expect(thumbs).toEqual([...images, red.imageUrl, blue.imageUrl]);
    expect(main).toBe(images[0]);
    expect(html).toContain('alt="هودي — صورة 1 من 5"');
    expect(html).toMatch(/aria-label="هودي — صورة 1"[^>]*aria-current="true"/);
    expect(html).toContain('aria-label="هودي — أزرق"');
    expect(html).toContain('aria-label="هودي — أحمر"');
    expect(html).not.toContain(green.imageUrl);
  });

  it('one display image and colours: the display image first and shown', () => {
    const html = render([images[2]!], [red, blue]);
    const [main, ...thumbs] = srcs(html);
    expect(main).toBe(images[2]);
    expect(thumbs).toEqual([images[2], red.imageUrl, blue.imageUrl]);
  });

  it('with colours and no display images: the colour images alone, opening on the pre-selected colour', () => {
    const html = render([], [red, blue]);
    const [main, ...thumbs] = srcs(html);
    expect(main).toBe(red.imageUrl);
    expect(thumbs).toEqual([red.imageUrl, blue.imageUrl]);
    expect(srcs(render([], [{ ...red, stock: 0 }, blue]))[0]).toBe(blue.imageUrl);
  });
});
