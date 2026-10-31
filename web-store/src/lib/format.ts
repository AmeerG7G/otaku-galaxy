/**
 * Display helpers shared by server and client components.
 *
 * Prices follow the mobile app exactly (`priceIqd`: "{amount} د.ع", whole
 * dinars, Western digits) so the same order never reads differently on the
 * website and in the app. These helpers only format; every amount shown at
 * checkout comes from the server.
 */
export function formatIqd(amount: number): string {
  // A no-break space keeps the amount and its currency on one line on narrow screens.
  return `${Math.round(amount).toFixed(0)}\u00A0د.ع`;
}

/** «قطعتان بـ7000 د.ع» — the two-piece offer label; `null` when the product has none. */
export function pairOfferLabel(pairPrice: number | null | undefined): string | null {
  return pairPrice === null || pairPrice === undefined ? null : `قطعتان بـ${formatIqd(pairPrice)}`;
}

/** Shown instead of a price while it is not announced (migration 084). */
export const PRICE_COMING_SOON = 'قريباً — السعر يُعلن لاحقاً';

/** The app's month names (`AppStrings` monthJanuary…monthDecember), so a date reads the same in both. */
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** The store's UTC offset (Baghdad, +03:00, no DST since 2008). */
const STORE_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * «13 أكتوبر» — the calendar day in the store's timezone, like the app's
 * `formatShortArabicDate`. The dashboard stores a chosen day as Baghdad
 * midnight (21:00Z the previous day), so a UTC or browser-local reading would
 * show the day before.
 */
export function formatShortStoreDate(value: string | Date): string {
  const store = new Date((typeof value === 'string' ? new Date(value) : value).getTime() + STORE_OFFSET_MS);
  return `${store.getUTCDate()} ${MONTHS_AR[store.getUTCMonth()]}`;
}

/**
 * The expected-availability date a shopper sees, or `null` — the app's
 * `Product.displayRestockAt`, one rule on both clients:
 * - no announced price: the date while it is still ahead (not buyable now);
 * - priced, out of stock, dated: «قريباً يتوفر» with its date;
 * - in stock: never (stock is the source of truth, not the date).
 */
export function displayRestockAt(
  product: { price: number | null; stock: number; restockAt: string | null },
  now: Date = new Date(),
): string | null {
  if (!product.restockAt) return null;
  if (product.price === null) return new Date(product.restockAt) > now ? product.restockAt : null;
  return product.stock <= 0 ? product.restockAt : null;
}

export const COMING_SOON = 'قريباً يتوفر';

const STATUS_LABELS: Record<string, string> = {
  PENDING_ADMIN_CONFIRMATION: 'بانتظار تأكيد الإدارة',
  CONFIRMED: 'تم تأكيد الطلب',
  PREPARING: 'قيد التجهيز',
  OUT_FOR_DELIVERY: 'في الطريق إليك',
  COMPLETED: 'تم الاستلام',
  REJECTED: 'مرفوض',
};

/** An unknown status (a later API) reads as «قيد المعالجة», never as a raw English code. */
export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? 'قيد المعالجة';
}

/** "2026/10/17 14:30" in the store's timezone (Baghdad), as the app shows it. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}/${pick('month')}/${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

/** "+9647XXXXXXXXX" (stored form) → "07XXXXXXXXX" (what Iraqi customers type and read). */
export function localPhone(e164: string): string {
  return e164.startsWith('+964') ? `0${e164.slice(4)}` : e164;
}
