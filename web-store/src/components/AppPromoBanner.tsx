import type { AppPromo } from '@/lib/app-promo';

/** Google's official Arabic «Get it on Google Play» badge, unmodified (`public/app-promo/`). */
const PLAY_BADGE = { src: '/app-promo/google-play-badge-ar.png', width: 646, height: 250 } as const;

/**
 * A real screenshot of the app's home screen, at the phone's 390×844 viewport.
 * Its shape is the phone screen's: the admin's upload fills the same box.
 */
const APP_SCREEN = { src: '/app-promo/app-home-ar.webp', width: 480, height: 1039 } as const;

/**
 * The admin's «download the app» card on the catalog home: the admin's texts
 * beside a phone whose screen shows the admin's promotion image — or, until
 * one is uploaded, the real app — and one link to the app's Google Play listing (opens
 * in a new tab), no tracking. Every image has a fixed box, so nothing shifts
 * while it loads. Not sticky and not a dialog, so it never covers the catalog.
 * Rendered only when the API sends an enabled promotion.
 *
 * The phone frame is part of this design, never of the upload: an image only
 * ever changes what is inside the screen.
 */
export function AppPromoBanner({ promo }: { promo: AppPromo }) {
  return (
    <aside
      className={`app-promo app-promo--${promo.style}`}
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
      <div className="app-promo__phone" aria-hidden="true">
        <div className="app-promo__device">
          <div className="app-promo__screen">
            {/* eslint-disable-next-line @next/next/no-img-element -- the local screenshot, or the admin's upload from the API's media origin as-is */}
            <img src={promo.image ?? APP_SCREEN.src} width={APP_SCREEN.width} height={APP_SCREEN.height} alt="" decoding="async" />
          </div>
        </div>
      </div>
    </aside>
  );
}
