'use client';

import { useRef, useState, type TouchEvent } from 'react';
import { galleryImages, stepIndex, swipeStep } from '@/lib/gallery';
import { useVariantSelection } from './VariantSelection';

/**
 * The product page gallery: the main image, previous/next buttons, a swipe on
 * touch screens, and one thumbnail button per image. The chosen colour's image
 * (STEP 74) leads; the product's ordinary images follow in their order. One
 * image (or none) renders as before — no buttons, no thumbnails.
 *
 * The thumbnails used to be bare `<img>`s on a server component and the first
 * image was left out of them, so the other uploaded images could never be shown
 * in the main slot.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const selection = useVariantSelection();
  const lead = selection?.selected?.imageUrl ?? null;
  const list = galleryImages(images, lead);
  const [active, setActive] = useState(0);
  const [shownLead, setShownLead] = useState(lead);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  // A ref, not state: `touchend` must see the `touchstart` even within one render.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // A newly chosen colour brings its own image to the front.
  if (lead !== shownLead) {
    setShownLead(lead);
    setActive(0);
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
  const label =
    lead && index === 0 && selection?.selected ? `${alt} — ${selection.selected.colorName}` : many ? `${alt} — صورة ${index + 1} من ${list.length}` : alt;

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
              aria-label={`${alt} — صورة ${i + 1}`}
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
