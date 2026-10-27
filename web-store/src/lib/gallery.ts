/**
 * The product page gallery's images, in order: the chosen colour's image first
 * when there is one (STEP 74), then the product's ordinary images exactly as
 * the API sent them (`sort_order`) — without repeating the colour's image and
 * without empty refs.
 */
export function galleryImages(images: readonly string[], leading?: string | null): string[] {
  const lead = leading?.trim() || null;
  const rest = images.filter((url) => url.trim() !== '' && url.trim() !== lead);
  return lead ? [lead, ...rest] : rest;
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
