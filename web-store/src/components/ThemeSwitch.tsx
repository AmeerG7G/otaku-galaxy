'use client';

import { useState } from 'react';
import { themeCookie, THEMES, type Theme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { system: 'تلقائي', light: 'فاتح', dark: 'داكن' };

/** Applies the choice to the page now and keeps it for the server's next render. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.cookie = themeCookie(theme, window.location.protocol === 'https:');
}

/**
 * Theme choice: follow the device (default), or always light / dark. The
 * choice applies at once (the `data-theme` attribute) and is kept in a
 * cookie the server reads on the next page, so it survives reloads and visits.
 */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <fieldset className="theme-switch">
      <legend>المظهر</legend>
      {THEMES.map((value) => (
        <label key={value} className="chip">
          <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => choose(value)} />
          {LABELS[value]}
        </label>
      ))}
    </fieldset>
  );
}
