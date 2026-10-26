// قاعدة رقم الهاتف على العميل تطابق قاعدة الخادم حرفاً بحرف.
//
// الجدول أدناه مرآةٌ لـ`backend/tests/phone-normalization.test.ts`: ما يقبله
// الخادم يقبله العميل، وما يرفضه يرفضه — فلا يُرسَل طلبٌ معروف الرفض، ولا
// يُحجب رقمٌ صالح. الإضافة الوحيدة على العميل: الأرقام الشرقية تُطبَّع
// (الخادم يرفضها كما هي — والتطبيق يرسل الغربية).

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/utils/iraqi_phone.dart';

void main() {
  group('المقبول — نفس مخرجات الخادم', () {
    for (final raw in [
      '07701234567',
      '7701234567',
      '9647701234567',
      '+9647701234567',
      '009647701234567',
      '  07701234567  ',
      '0770 123 4567',
      '0770-123-4567',
      '+964 770 123 4567',
      '(0770)123-4567',
      '077.012.345.67',
      '07701234567\n',
    ]) {
      test('«${raw.trim()}» → +9647701234567', () {
        expect(normalizeIraqiPhone(raw), '+9647701234567');
      });
    }

    test('الشبكات الثلاث: كورك 075، آسياسيل 077، زين 078/079 — و076', () {
      for (final prefix in ['075', '076', '077', '078', '079']) {
        expect(isValidIraqiPhone('${prefix}01234567'), isTrue, reason: prefix);
      }
    });

    test('[CRITICAL] الأرقام الشرقية تُطبَّع لا تُرفض', () {
      expect(normalizeIraqiPhone('٠٧٧٠١٢٣٤٥٦٧'), '+9647701234567');
      expect(normalizeIraqiPhone('۰۷۷۰۱۲۳۴۵۶۷'), '+9647701234567');
      expect(normalizeIraqiPhone('٠٧٧٠ ١٢٣ ٤٥٦٧'), '+9647701234567');
    });
  });

  group('المرفوض — نفس رفض الخادم', () {
    for (final raw in [
      '',
      '   ',
      '123',
      '0770123456', // عشرة أرقام — كان التطبيق يقبلها.
      '077012345678', // اثنا عشر.
      '07001234567', // 070 ليست شبكة.
      '07401234567', // 074 ليست شبكة.
      '+9649647701234567',
      '+9647701234567890',
      '+1234567890',
      'abcdefghijk',
      '0770abc4567',
      '+964770123456a',
      '077\t01234567',
      '0770\r1234567',
    ]) {
      test('«${raw.replaceAll('\t', r'\t').replaceAll('\r', r'\r')}» مرفوض', () {
        expect(normalizeIraqiPhone(raw), isNull);
        expect(isValidIraqiPhone(raw), isFalse);
      });
    }
  });

  test('normalizeDigits يترك غير الأرقام كما هو', () {
    expect(normalizeDigits('abc ٠١٢ ۳ x'), 'abc 012 3 x');
  });

  // [PRODUCT] (2026-09-27) لا بادئة `07` ثابتة في الحقل: الزبون يكتب الرقم
  // كاملاً بنفسه. القاعدة نفسها لم تتغيّر — موبايل عراقي 075–079 — ولم
  // تتّسع لأرضيٍّ ولا لأجنبي.
  group('[CRITICAL] حقل الهاتف: الرقم كاملاً بصيغته المحلية، بلا بادئة مُدرَجة', () {
    test('07701234567 وأمثاله من كل الشبكات صالحة', () {
      for (final prefix in ['075', '076', '077', '078', '079']) {
        expect(isValidIraqiLocalPhone('${prefix}01234567'), isTrue, reason: prefix);
      }
      expect(isValidIraqiLocalPhone('07701234567'), isTrue);
      expect(isValidIraqiLocalPhone('٠٧٧٠١٢٣٤٥٦٧'), isTrue, reason: 'أرقام شرقية');
      expect(isValidIraqiLocalPhone('0770 123 4567'), isTrue, reason: 'فواصل مألوفة');
    });

    test('[CRITICAL] ما لا يبدأ بـ07 أو ليس موبايلاً عراقياً مرفوض — لا توسيع للقاعدة', () {
      for (final raw in [
        '7701234567', // بلا 07 — على الزبون أن يكتبها.
        '0770123456', // عشرة أرقام.
        '077012345678', // اثنا عشر.
        '07001234567', // 070 ليست شبكة.
        '07401234567', // 074 ليست شبكة.
        '0662251234', // أرضي.
        '016225123', // أرضي بغداد.
        '+9647701234567', // الحقل للصيغة المحلية.
        '+447700900123', // أجنبي.
        '00989121234567', // أجنبي.
        '',
        'abcdefghijk',
      ]) {
        expect(isValidIraqiLocalPhone(raw), isFalse, reason: raw);
      }
    });

    test('ما يصلح في الحقل يطابق قاعدة الخادم نفسها بعد التطبيع', () {
      expect(normalizeIraqiPhone('07701234567'), '+9647701234567');
      for (final raw in ['07501234567', '07991234567']) {
        expect(isValidIraqiLocalPhone(raw), isTrue, reason: raw);
        expect(isValidIraqiPhone(raw), isTrue, reason: raw);
      }
    });

    test('[CRITICAL] لا بادئة تُضاف ولا تُحذف: ما يكتبه الزبون يبقى أرقامَه', () {
      expect(iraqiPhoneInputText('7'), '7');
      expect(iraqiPhoneInputText('0'), '0');
      expect(iraqiPhoneInputText('07'), '07');
      expect(iraqiPhoneInputText('07701234567'), '07701234567');
      expect(iraqiPhoneInputText('7701234567'), '7701234567');
      expect(iraqiPhoneInputText('٠٧٧٠ ١٢٣ ٤٥٦٧'), '07701234567');
      expect(iraqiPhoneInputText('(077) 012-3456-7'), '07701234567');
      expect(iraqiPhoneInputText('7a0b1c'), '701');
      expect(iraqiPhoneInputText('077012345678'), '07701234567', reason: 'أحد عشر رقماً حدّاً');
      expect(iraqiPhoneInputText(''), '');
      expect(iraqiPhoneInputText('abc'), '');
    });

    test('المُنسّق يطبّق ذلك على ما يُكتب ويضع المؤشّر في النهاية', () {
      const formatter = IraqiPhoneInputFormatter();
      final out = formatter.formatEditUpdate(
        TextEditingValue.empty,
        const TextEditingValue(text: '٠٧٧٠ ١٢٣ ٤٥٦٧ x'),
      );
      expect(out.text, '07701234567');
      expect(out.selection.baseOffset, 11);
      // ما هو صالحٌ أصلاً يمرّ كما هو بمؤشّره.
      const fine = TextEditingValue(text: '0770', selection: TextSelection.collapsed(offset: 2));
      expect(identical(formatter.formatEditUpdate(TextEditingValue.empty, fine), fine), isTrue);
    });
  });
}
