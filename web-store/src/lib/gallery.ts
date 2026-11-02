import type { Product, ProductVariant } from './types';
import { customerVariants } from './variants';

/**
 * The product page's one gallery, in a fixed order (owner decision 2026-11-02,
 * supersedes STEP 75's "colours first"):
 *
 * 1. the product's own display images exactly as the API sent them
 *    (`images`, `sort_order` — the first is the main display image);
 * 2. then the image of every colour/option the customer can see
 *    (`customerVariants`: active ones, by `sortOrder`) — one image each (STEP 74).
 *
 * An image is identified by its stored media reference (resolved the same way
 * for product and colour images), so an image that is a colour's image and was
 * also uploaded as a display image appears once, in the display image's place
 * (choosing that colour still finds it there). Empty refs are dropped.
 *
 * [NOTE] The app's `productGalleryImages` still puts the colours first; it is
 * not changed with this rule.
 */
export function galleryImages(images: readonly string[], colours: readonly Pick<ProductVariant, 'imageUrl'>[] = []): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of [...images, ...colours.map((colour) => colour.imageUrl ?? '')]) {
    const url = raw.trim();
    if (url !== '' && !seen.has(url)) {
      seen.add(url);
      list.push(url);
    }
  }
  return list;
}

/**
 * The image on product cards and in link previews: the first general image, as
 * before; a coloured product with no general image shows its first visible
 * colour's image — the admin never has to upload a colour's image twice.
 */
export function coverImage(product: Pick<Product, 'images' | 'variants'>): string | null {
  return galleryImages(product.images)[0] ?? galleryImages([], customerVariants(product))[0] ?? null;
}

/** Where a colour's image sits in the gallery, or `null` (no image / not shown). */
export function colourImageIndex(list: readonly string[], colour: Pick<ProductVariant, 'imageUrl'> | null | undefined): number | null {
  const url = colour?.imageUrl?.trim();
  if (!url) return null;
  const index = list.indexOf(url);
  return index < 0 ? null : index;
}

/** Moves `index` by `delta` within `[0, length - 1]` — the gallery stops at its ends, it does not wrap. */
export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index + delta, 0), length - 1);
}

/** A horizontal swipe of at least this many pixels changes the image. */
export const SWIPE_MIN_PX = 40;

/**
 * The step a horizontal swipe makes (−1, 0 or +1). The store is RTL: the next
 * image comes in from the left, so a finger moving right (`dx > 0`) goes to the
 * next image — the same direction as the app's gallery.
 */
export function swipeStep(dx: number, dy: number): number {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx > 0 ? 1 : -1;
}
