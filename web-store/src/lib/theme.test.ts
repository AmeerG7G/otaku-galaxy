import { describe, expect, it } from 'vitest';
import { parseTheme, themeCookie } from './theme';

describe('theme preference', () => {
  it('follows the device unless the shopper chose light or dark', () => {
    expect(parseTheme(undefined)).toBe('system');
    expect(parseTheme('')).toBe('system');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    // Anything else (a tampered cookie) is ignored, never reflected into the page.
    expect(parseTheme('"><script>')).toBe('system');
    expect(parseTheme('DARK')).toBe('system');
  });

  it('keeps an explicit choice for a year and clears it for «تلقائي»', () => {
    expect(themeCookie('dark', true)).toBe('og_theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
    expect(themeCookie('light', false)).toBe('og_theme=light; Max-Age=31536000; Path=/; SameSite=Lax');
    expect(themeCookie('system', true)).toBe('og_theme=; Max-Age=0; Path=/; SameSite=Lax; Secure');
  });
});
