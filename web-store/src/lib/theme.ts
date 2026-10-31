/**
 * The shopper's theme choice. `system` (the default, and what a missing or
 * unknown cookie means) follows the device's light/dark setting through CSS
 * alone; `light`/`dark` are written by the server as `data-theme` on <html>,
 * so the first paint is already right and no inline script is needed (the
 * CSP allows only nonce'd scripts).
 *
 * The cookie is a display preference, not a secret: it is readable by the
 * page that sets it and carries nothing else.
 */
export const THEME_COOKIE = 'og_theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** One year; `system` clears the cookie instead of storing a default. */
export function themeCookie(theme: Theme, secure: boolean): string {
  const attributes = `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  return theme === 'system' ? `${THEME_COOKIE}=; Max-Age=0; ${attributes}` : `${THEME_COOKIE}=${theme}; Max-Age=31536000; ${attributes}`;
}
