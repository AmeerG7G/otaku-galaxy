/**
 * The Iraqi phone rule on the web store — a copy of the app's
 * (`lib/core/utils/iraqi_phone.dart`), which is the reference. The API
 * (`backend/src/utils/phone.ts`) enforces the same rule on every request.
 * `test/fixtures/iraqi_phone_vectors.json` pins all three to the same answers.
 *
 * - The field holds the whole local number as the customer types it,
 *   `07XXXXXXXXX`: digits only, Eastern digits turned Western, at most 11 —
 *   nothing is added or removed (`7` stays `7`; a pasted `+964…` is not converted).
 * - Valid = `07` then `5`–`9` then eight digits (075–079; 070–074 are not mobile ranges).
 * - What is sent is E.164 (`+9647XXXXXXXXX`), what the API stores.
 */

/** Length of the field: `07` and nine digits. */
export const IRAQI_LOCAL_PHONE_LENGTH = 11;

/** The app's messages (`phoneRequired`, `phoneInvalid`). */
export const PHONE_REQUIRED_MESSAGE = 'يرجى إدخال رقم الهاتف';
export const PHONE_INVALID_MESSAGE = 'رقم الهاتف غير صحيح';

const NATIONAL = /^7[5-9]\d{8}$/;
const LOCAL_MOBILE = /^07[5-9]\d{8}$/;
const SEPARATORS = /[ ()\-.]/g;

/** Arabic-Indic (٠–٩) and Persian (۰–۹) digits to 0–9; everything else unchanged. */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** `+9647XXXXXXXXX`, or `null` when it is not a valid Iraqi mobile number. */
export function normalizeIraqiPhone(raw: string): string | null {
  const trimmed = normalizeDigits(raw.trim()).replace(SEPARATORS, '');
  if (!/^\+?\d+$/.test(trimmed)) return null;
  const digits = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  let national: string;
  if (digits.startsWith('00964')) national = digits.slice(5);
  else if (digits.startsWith('964')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  return NATIONAL.test(national) ? `+964${national}` : null;
}

/** Is the field a complete Iraqi mobile number in its local form `07XXXXXXXXX`? */
export function isValidIraqiLocalPhone(raw: string): boolean {
  return LOCAL_MOBILE.test(normalizeDigits(raw.trim()).replace(SEPARATORS, ''));
}

/** What stays in the field from anything typed or pasted: digits only, at most 11. */
export function iraqiPhoneInputText(raw: string): string {
  return normalizeDigits(raw).replace(/[^0-9]/g, '').slice(0, IRAQI_LOCAL_PHONE_LENGTH);
}

/** The field's error, or `null` — the app's validator, in its order. */
export function phoneFieldError(raw: string): string | null {
  if (raw.trim() === '') return PHONE_REQUIRED_MESSAGE;
  return isValidIraqiLocalPhone(raw) ? null : PHONE_INVALID_MESSAGE;
}
