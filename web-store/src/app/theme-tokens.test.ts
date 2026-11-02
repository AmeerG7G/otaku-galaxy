import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Theme tokens (globals.css): every text/fill pair meets WCAG AA (4.5:1) in
 * the light and the dark theme, and the two dark blocks — the device setting
 * and the shopper's explicit choice — define exactly the same colours.
 */

const css = readFileSync(path.join(import.meta.dirname, 'globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1]!, match[2]!.trim()]));
}

const light = block(':root');
const darkMedia = block(":root:not([data-theme='light'])");
const darkChosen = block(":root[data-theme='dark']");
const dark = { ...light, ...darkMedia };

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const channels = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [text, background] — every pairing the stylesheet uses for readable text. */
const PAIRS: Array<[string, string]> = [
  ['--on-surface', '--surface'],
  ['--on-surface', '--background'],
  ['--on-surface', '--surface-variant'],
  ['--on-surface-variant', '--surface'],
  ['--on-surface-variant', '--background'],
  ['--on-surface-variant', '--surface-variant'],
  ['--brand-text', '--surface'],
  ['--brand-text', '--background'],
  ['--brand-text', '--primary-pale'],
  ['--on-brand', '--brand-fill'],
  ['--on-brand', '--cta-start'],
  ['--on-brand', '--cta-end'],
  ['--warning-text', '--surface'],
  ['--warning-text', '--warning-pale'],
  ['--success-text', '--success-pale'],
  ['--error-text', '--error-pale'],
  ['--info-text', '--info-pale'],
];

describe('theme tokens', () => {
  it('the device-setting and the chosen dark theme are identical', () => {
    expect(darkChosen).toEqual(darkMedia);
  });

  for (const [name, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it.each(PAIRS)(`${name}: %s on %s is at least 4.5:1`, (text, background) => {
      expect(contrast(tokens[text]!, tokens[background]!)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('no white text is hard-coded outside the tokens', () => {
    const rules = css.slice(css.indexOf("}", css.indexOf(":root[data-theme='dark']")));
    expect(rules).not.toMatch(/color:\s*#fff/i);
  });
});

describe('brand mark', () => {
  const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const original = path.resolve(import.meta.dirname, '../../../assets/branding/otaku-square-mark.png');

  // The site icons are byte copies of the app's square mark — never re-rendered or edited.
  it.each(['icon.png', 'apple-icon.png'])('%s is the app logo, byte for byte', (name) => {
    expect(sha(path.join(import.meta.dirname, name))).toBe(sha(original));
  });
});
