import type { AppPromo } from '@/lib/app-promo';

/**
 * The admin's «download the app» card on the catalog home: one link to the
 * app's Google Play listing (opens in a new tab), no tracking, no artwork —
 * a phone glyph only. Not sticky and not a dialog, so it never covers the
 * catalog. Rendered only when the API sends an enabled promotion.
 */
export function AppPromoBanner({ promo }: { promo: AppPromo }) {
  return (
    <aside className={`app-promo app-promo--${promo.style}`} aria-labelledby="app-promo-title">
      <svg className="app-promo__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7v7m0 0-3-3m3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="18.5" r="1" fill="currentColor" />
      </svg>
      <div className="app-promo__text">
        <p id="app-promo-title" className="app-promo__title">
          {promo.title}
        </p>
        <p className="app-promo__subtitle">{promo.subtitle}</p>
      </div>
      <a className="app-promo__cta" href={promo.url} target="_blank" rel="noopener noreferrer">
        {promo.cta}
        <span className="visually-hidden"> — Google Play (يفتح في نافذة جديدة)</span>
      </a>
    </aside>
  );
}
