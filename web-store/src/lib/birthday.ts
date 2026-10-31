/**
 * Birthday display helpers. The rules — set once, only after the first
 * received order, a valid day for the month — are the API's.
 */

// The app's month names (`app_strings.dart`, batch 10).
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const MONTH_NAMES: readonly string[] = MONTHS;

/** Days in a month of a leap year — 29 February is a valid birthday. */
export function daysInMonth(month: number): number {
  return new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}
