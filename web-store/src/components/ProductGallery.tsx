'use client';

import { useRef, useState, type TouchEvent } from 'react';
import { colourImageIndex, galleryImages, stepIndex, swipeStep } from '@/lib/gallery';
import { customerVariants } from '@/lib/variants';
import { useVariantSelection } from './VariantSelection';

/**
 * The product page gallery: the main image, previous/next buttons, a swipe on
 * touch screens, and one thumbnail button per image. Every visible colour's
 * image comes first (STEP 74), then the product's general images, without a
 * repeat (`galleryImages`). One image (or none) renders as before — no buttons,
 * no thumbnails.
 *
 * [CRITICAL] Browsing never chooses a colour: the gallery only reads the
 * selection. Choosing a colour (the radio buttons) moves the gallery to that
 * colour's image; showing a colour's image here does not select it for the cart.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const selection = useVariantSelection();
  // Inactive colours are never shown, even if a caller passed them.
  const colours = customerVariants({ variants: selection?.variants });
  const list = galleryImages(images, colours);
  const selectedId = selection?.selected?.id ?? null;
  const [active, setActive] = useState(() => colourImageIndex(list, selection?.selected) ?? 0);
  const [shownSelectedId, setShownSelectedId] = useState(selectedId);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  // A ref, not state: `touchend` must see the `touchstart` even within one render.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // A newly chosen colour brings the gallery to its image.
  if (selectedId !== shownSelectedId) {
    setShownSelectedId(selectedId);
    const focus = colourImageIndex(list, selection?.selected);
    if (focus !== null) setActive(focus);
  }
  const index = stepIndex(active, 0, list.length);
  const src = list[index];
  const many = list.length > 1;
  const go = (delta: number) => setActive((current) => stepIndex(stepIndex(current, 0, list.length), delta, list.length));
  const markFailed = (url: string) => setFailed((current) => (current.has(url) ? current : new Set(current).add(url)));
  // An image that failed before hydration fired its `error` before React listened.
  const failedBeforeHydration = (url: string) => (image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) markFailed(url);
  };
  const colourOf = (url: string | undefined) => colours.find((colour) => colour.imageUrl?.trim() === url);
  const shownColour = colourOf(src);
  const label = shownColour ? `${alt} — ${shownColour.colorName}` : many ? `${alt} — صورة ${index + 1} من ${list.length}` : alt;

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    const start = touchStart.current;
    if (start && touch) go(swipeStep(touch.clientX - start.x, touch.clientY - start.y));
    touchStart.current = null;
  };

  return (
    <div className="gallery">
      <div className="gallery__main" onTouchStart={many ? onTouchStart : undefined} onTouchEnd={many ? onTouchEnd : undefined}>
        {src && !failed.has(src) ? (
          // eslint-disable-next-line @next/next/no-img-element -- media origin is the API's, served as-is
          <img key={src} src={src} alt={label} width={600} height={600} fetchPriority={index === 0 ? 'high' : undefined} ref={failedBeforeHydration(src)} onError={() => markFailed(src)} />
        ) : null}
        {many ? (
          <>
            <button type="button" className="gallery__nav gallery__nav--prev" aria-label="الصورة السابقة" disabled={index === 0} onClick={() => go(-1)}>
              ›
            </button>
            <button type="button" className="gallery__nav gallery__nav--next" aria-label="الصورة التالية" disabled={index === list.length - 1} onClick={() => go(1)}>
              ‹
            </button>
          </>
        ) : null}
      </div>
      {many ? (
        <div className="gallery__thumbs">
          {list.map((url, i) => (
            <button
              key={url}
              type="button"
              className="gallery__thumb"
              aria-label={`${alt} — ${colourOf(url)?.colorName ?? `صورة ${i + 1}`}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setActive(i)}
            >
              {failed.has(url) ? null : (
                // eslint-disable-next-line @next/next/no-img-element -- see above
                <img src={url} alt="" width={64} height={64} loading="lazy" ref={failedBeforeHydration(url)} onError={() => markFailed(url)} />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
