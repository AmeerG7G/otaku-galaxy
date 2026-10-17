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

const STATUS_LABELS: Record<string, string> = {
  PENDING_ADMIN_CONFIRMATION: 'بانتظار تأكيد الإدارة',
  CONFIRMED: 'تم تأكيد الطلب',
  PREPARING: 'قيد التجهيز',
  OUT_FOR_DELIVERY: 'في الطريق إليك',
  COMPLETED: 'تم الاستلام',
  REJECTED: 'مرفوض',
};

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
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
