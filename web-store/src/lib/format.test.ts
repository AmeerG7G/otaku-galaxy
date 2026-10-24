import { describe, expect, it } from 'vitest';
import { formatDateTime, formatIqd, localPhone, orderStatusLabel } from './format';
import { resolveMediaUrl } from './media';

describe('formatIqd', () => {
  it('matches the app: whole dinars, Western digits, no grouping — never split across lines', () => {
    expect(formatIqd(45000)).toBe('45000\u00A0د.ع');
    expect(formatIqd(0)).toBe('0\u00A0د.ع');
    expect(formatIqd(2499.6)).toBe('2500\u00A0د.ع');
  });
});

describe('orderStatusLabel', () => {
  it('names every status the API returns', () => {
    for (const status of ['PENDING_ADMIN_CONFIRMATION', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED']) {
      expect(orderStatusLabel(status)).not.toBe(status);
    }
    expect(orderStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('formatDateTime', () => {
  it('shows Baghdad time', () => {
    expect(formatDateTime('2026-10-17T12:30:00Z')).toBe('2026/10/17 15:30');
  });
});

describe('localPhone', () => {
  it('shows the stored international form the way Iraqis write it', () => {
    expect(localPhone('+9647701234567')).toBe('07701234567');
    expect(localPhone('07701234567')).toBe('07701234567');
  });
});

describe('resolveMediaUrl', () => {
  const origin = 'https://api.otakugalaxystore.com';

  it('resolves relative uploads against the media origin and passes http(s) through', () => {
    expect(resolveMediaUrl('/uploads/products/a.webp', origin)).toBe(`${origin}/uploads/products/a.webp`);
    expect(resolveMediaUrl('/uploads/a.webp', `${origin}/`)).toBe(`${origin}/uploads/a.webp`);
    expect(resolveMediaUrl('https://cdn.example/a.webp', origin)).toBe('https://cdn.example/a.webp');
  });

  it('drops anything else', () => {
    for (const value of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil.example/a.png', 'uploads/a.png', '', '   ', null, undefined]) {
      expect(resolveMediaUrl(value, origin), String(value)).toBeNull();
    }
  });
});
