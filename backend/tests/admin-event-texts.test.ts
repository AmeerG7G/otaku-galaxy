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

});

/**
 * [PRIVACY] نصوص إشعار المسؤول تظهر على شاشة القفل وتمرّ بـFCM: لا رقم هاتف
 * زبون فيها. الرقم يُقرأ في صفحة الطلبات بعد الدخول.
 */
describe('[CRITICAL] إشعار طلب الحساب بلا رقم الزبون', () => {
  it('النوع في العنوان والاسم في النصّ — ولا شيء غيرهما', () => {
    expect(ADMIN_EVENT_TEXTS.accountRequest('registration', 'أمير')).toEqual({
      title: 'طلب إنشاء حساب',
      body: 'أمير',
    });
    expect(ADMIN_EVENT_TEXTS.accountRequest('password_reset', 'أمير')).toEqual({
      title: 'طلب إعادة تعيين كلمة المرور',
      body: 'أمير',
    });
  });

  it('لا نصّ إشعار مسؤول يحمل رقماً بطول هاتف', () => {
    const texts = [
      ADMIN_EVENT_TEXTS.accountRequest('registration', 'أمير'),
      ADMIN_EVENT_TEXTS.accountRequest('password_reset', 'أمير'),
      ADMIN_EVENT_TEXTS.newOrder('أمير', 125000),
      ADMIN_EVENT_TEXTS.restockRequest('مجسّم'),
    ];
    for (const { title, body } of texts) {
      expect(`${title} ${body}`).not.toMatch(/(?:\+?964|0)7\d{9}|\d{9,}/);
    }
  });
});
