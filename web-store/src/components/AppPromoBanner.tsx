import type { AppPromo } from '@/lib/app-promo';

/** Google's official Arabic «Get it on Google Play» badge, unmodified (`public/app-promo/`). */
const PLAY_BADGE = { src: '/app-promo/google-play-badge-ar.png', width: 646, height: 250 } as const;

/** A real screenshot of the app's home screen, at the phone's 390×844 viewport. */
const APP_SCREEN = { src: '/app-promo/app-home-ar.webp', width: 480, height: 1039 } as const;

/** The admin's uploaded image is shown in a square box (recommended 1080×1080). */
const ART_SIZE = 1080;

/**
 * The admin's «download the app» card on the catalog home: the admin's texts
 * beside the admin's promotion image — or, until one is uploaded, a phone
 * showing the real app — and one link to the app's Google Play listing (opens
 * in a new tab), no tracking. Every image has a fixed box, so nothing shifts
 * while it loads. Not sticky and not a dialog, so it never covers the catalog.
 * Rendered only when the API sends an enabled promotion.
 */
export function AppPromoBanner({ promo }: { promo: AppPromo }) {
  return (
    <aside
      className={`app-promo app-promo--${promo.style}${promo.image ? ' app-promo--art' : ''}`}
      aria-labelledby="app-promo-title"
    >
      <div className="app-promo__text">
        <p id="app-promo-title" className="app-promo__title">
          {promo.title}
        </p>
        <p className="app-promo__subtitle">{promo.subtitle}</p>
        <a className="app-promo__cta" href={promo.url} target="_blank" rel="noopener noreferrer">
          <span className="app-promo__cta-label">{promo.cta}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- Google's badge is served exactly as published, never re-encoded */}
          <img
            className="app-promo__badge"
            src={PLAY_BADGE.src}
            width={PLAY_BADGE.width}
            height={PLAY_BADGE.height}
            alt="احصل عليه من Google Play"
            decoding="async"
          />
          <span className="visually-hidden"> (يفتح في نافذة جديدة)</span>
        </a>
      </div>
      {promo.image ? (
        <div className="app-promo__art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- the admin's upload, from the API's media origin as-is */}
          <img src={promo.image} width={ART_SIZE} height={ART_SIZE} alt="" decoding="async" />
        </div>
      ) : (
        <div className="app-promo__phone" aria-hidden="true">
          <div className="app-promo__device">
            <div className="app-promo__screen">
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size local file; no optimizer needed */}
              <img src={APP_SCREEN.src} width={APP_SCREEN.width} height={APP_SCREEN.height} alt="" decoding="async" />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
