import { playStoreUrl } from './app-link';

/** The production app's id — the only listing the promotion may open (`android/app/build.gradle.kts`). */
export const OFFICIAL_APP_ID = 'com.otakugalaxy.otaku_galaxy';

/** Shown when the admin leaves a text empty (same as the dashboard's placeholders). */
export const APP_PROMO_DEFAULTS = {
  title: 'تطبيق مجرة الأوتاكو على Google Play',
  subtitle: 'تسوّق أسرع، وتابع طلباتك وعروضك من هاتفك.',
  cta: 'حمّل التطبيق الآن',
} as const;

export type AppPromoStyle = 'violet' | 'night';

export interface AppPromo {
  title: string;
  subtitle: string;
  cta: string;
  url: string;
  style: AppPromoStyle;
}

const text = (value: unknown, max: number, fallback: string) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? fallback : trimmed.slice(0, max);
};

/**
 * The admin's «download the app» promotion from `/catalog/settings`
 * (`webAppPromo`), or `null` to hide it: the API sends `null` when it is off or
 * has no link. The link is checked again here — only the production app's
 * Google Play listing is ever linked (no APK, no other store).
 */
export function toAppPromo(raw: unknown): AppPromo | null {
  if (!raw || typeof raw !== 'object') return null;
  const promo = raw as Record<string, unknown>;
  const url = playStoreUrl(promo.url);
  if (url === null || new URL(url).searchParams.get('id') !== OFFICIAL_APP_ID) return null;
  return {
    title: text(promo.title, 60, APP_PROMO_DEFAULTS.title),
    subtitle: text(promo.subtitle, 120, APP_PROMO_DEFAULTS.subtitle),
    cta: text(promo.cta, 30, APP_PROMO_DEFAULTS.cta),
    url,
    style: promo.style === 'night' ? 'night' : 'violet',
  };
}
