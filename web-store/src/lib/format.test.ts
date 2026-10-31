import { describe, expect, it } from 'vitest';
import { displayRestockAt, formatDateTime, formatIqd, formatStoreDate, localPhone, orderStatusLabel } from './format';
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

describe('formatStoreDate — the Baghdad calendar day, like the app', () => {
  it('Baghdad midnight stored as 21:00Z reads as the chosen day, not the day before', () => {
    expect(formatStoreDate('2026-10-12T21:00:00.000Z')).toBe('2026-10-13');
    expect(formatStoreDate('2026-10-12T20:59:00.000Z')).toBe('2026-10-12');
  });
  it('crosses month, year and leap-day boundaries in the store timezone', () => {
    expect(formatStoreDate('2026-12-31T21:00:00.000Z')).toBe('2027-01-01');
    expect(formatStoreDate('2028-02-28T21:00:00.000Z')).toBe('2028-02-29');
    expect(formatStoreDate('2026-01-31T21:00:00.000Z')).toBe('2026-02-01');
  });
  it('zero-pads single-digit months and days (STEP 77)', () => {
    expect(formatStoreDate('2026-07-02T21:00:00.000Z')).toBe('2026-07-03');
  });
});

describe('displayRestockAt — one rule with the app', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const future = '2026-11-04T21:00:00.000Z';
  const past = '2026-10-12T21:00:00.000Z';
  it('no announced price: the date while it is ahead, never a past one', () => {
    expect(displayRestockAt({ price: null, stock: 1, restockAt: future }, now)).toBe(future);
    expect(displayRestockAt({ price: null, stock: 1, restockAt: past }, now)).toBeNull();
  });
  it('priced: only when out of stock (coming soon), never when buyable', () => {
    expect(displayRestockAt({ price: 5000, stock: 0, restockAt: future }, now)).toBe(future);
    expect(displayRestockAt({ price: 5000, stock: 3, restockAt: future }, now)).toBeNull();
  });
  it('a malformed date: nothing, never a fabricated day', () => {
    expect(displayRestockAt({ price: 5000, stock: 0, restockAt: 'not-a-date' }, now)).toBeNull();
  });
  it('no date: nothing', () => {
    expect(displayRestockAt({ price: null, stock: 0, restockAt: null }, now)).toBeNull();
    expect(displayRestockAt({ price: 5000, stock: 0, restockAt: null }, now)).toBeNull();
  });
});
