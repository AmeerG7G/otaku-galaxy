import { describe, expect, it } from 'vitest';
import { ADMIN_EVENT_TEXTS } from '../src/domain/adminEventTexts.js';
import { formatIraqiPhone } from '../src/utils/phone.js';

/**
 * الهاتف كما يقرؤه المسؤول — `07XXXXXXXXX`، كما في كل شاشات اللوحة
 * (`admin/src/utils/phone.ts`). للعرض وحده: المخزَّن يبقى `+9647…`.
 */
describe('عرض الهاتف للمسؤول بالصيغة المحلية', () => {
  it('كل صيغة عراقية مشروعة ← 07…', () => {
    for (const input of ['+9647701234567', '9647701234567', '009647701234567', '07701234567', '7701234567']) {
      expect(formatIraqiPhone(input), input).toBe('07701234567');
    }
  });

  it('التنسيق ثابت: تنسيقُ المنسَّق لا يغيّره', () => {
    expect(formatIraqiPhone(formatIraqiPhone('+9647701234567'))).toBe('07701234567');
  });

  it('[CRITICAL] ما ليس موبايلاً عراقياً صالحاً يُعرض كما وصل', () => {
    for (const input of ['', '+447700900123', '+9647401234567', '+96477012345678', '0770****567', 'abc']) {
      expect(formatIraqiPhone(input), input).toBe(input);
    }
  });

  it('إشعار طلب الحساب يعرض الرقم كما تعرضه اللوحة', () => {
    expect(ADMIN_EVENT_TEXTS.accountRequest('registration', 'أمير', '+9647701234567').body).toBe('أمير — 07701234567');
    expect(ADMIN_EVENT_TEXTS.accountRequest('password_reset', 'أمير', '+9647809876543').body).toBe('أمير — 07809876543');
  });
});
