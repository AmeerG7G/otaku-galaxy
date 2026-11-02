import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IRAQI_LOCAL_PHONE_LENGTH,
  PHONE_INVALID_MESSAGE,
  PHONE_REQUIRED_MESSAGE,
  iraqiPhoneInputText,
  isValidIraqiLocalPhone,
  normalizeIraqiPhone,
  phoneFieldError,
} from './phone';

/** The vectors the app's own test checks (`test/iraqi_phone_vectors_test.dart`). */
const vectors = JSON.parse(readFileSync(new URL('../../../test/fixtures/iraqi_phone_vectors.json', import.meta.url), 'utf8')) as {
  maxFieldLength: number;
  normalize: Array<{ raw: string; e164: string | null }>;
  localField: Array<{ raw: string; valid: boolean }>;
  fieldInput: Array<{ raw: string; text: string }>;
};

describe('web phone rule = the app rule (shared vectors)', () => {
  it('the field length is the app length', () => {
    expect(IRAQI_LOCAL_PHONE_LENGTH).toBe(vectors.maxFieldLength);
  });

  it('normalizeIraqiPhone', () => {
    for (const row of vectors.normalize) expect(normalizeIraqiPhone(row.raw), JSON.stringify(row.raw)).toBe(row.e164);
  });

  it('isValidIraqiLocalPhone', () => {
    for (const row of vectors.localField) expect(isValidIraqiLocalPhone(row.raw), JSON.stringify(row.raw)).toBe(row.valid);
  });

  it('iraqiPhoneInputText — typing and pasting', () => {
    for (const row of vectors.fieldInput) expect(iraqiPhoneInputText(row.raw), JSON.stringify(row.raw)).toBe(row.text);
  });

  it('the oversized example from the bug cannot stay in the field', () => {
    expect(iraqiPhoneInputText('0787373737377377')).toHaveLength(IRAQI_LOCAL_PHONE_LENGTH);
    expect(isValidIraqiLocalPhone('0787373737377377')).toBe(false);
    expect(normalizeIraqiPhone('0787373737377377')).toBeNull();
  });

  it('messages are the app ones, required before invalid', () => {
    expect(phoneFieldError('')).toBe(PHONE_REQUIRED_MESSAGE);
    expect(phoneFieldError('   ')).toBe(PHONE_REQUIRED_MESSAGE);
    expect(phoneFieldError('0770')).toBe(PHONE_INVALID_MESSAGE);
    expect(phoneFieldError('07001234567')).toBe(PHONE_INVALID_MESSAGE);
    expect(phoneFieldError('07701234567')).toBeNull();
    expect(PHONE_REQUIRED_MESSAGE).toBe('يرجى إدخال رقم الهاتف');
    expect(PHONE_INVALID_MESSAGE).toBe('رقم الهاتف غير صحيح');
  });
});
