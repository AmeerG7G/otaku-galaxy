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

  group('حقل الهاتف ببادئة 07 ثابتة', () {
    // البادئة تُعرض في الحقل ولا يكتبها المستخدم؛ كل ما يُكتب أو يُلصق يُحوَّل
    // إلى الأرقام التسعة التي تليها — بأي صيغةٍ جاء.
    test('[CRITICAL] كل الصيغ تعطي الأرقام التسعة نفسها بعد 07', () {
      for (final raw in [
        '701234567',
        '07701234567',
        '+9647701234567',
        '009647701234567',
        '9647701234567',
        '٠٧٧٠١٢٣٤٥٦٧',
        '0770 123 4567',
        '(077) 012-3456-7',
      ]) {
        expect(iraqiLocalDigits(raw), '701234567', reason: raw);
      }
    });

    test('لا حروف ولا أكثر من تسعة أرقام — والرقم العاشر يُقصّ ولا يُزيح ما قبله', () {
      expect(iraqiLocalDigits('7a0b1c'), '701');
      expect(iraqiLocalDigits('7012345671234'), '701234567');
      expect(iraqiLocalDigits('7012345678'), '701234567', reason: 'ضغطة زائدة لا تغيّر التسعة');
      expect(iraqiLocalDigits(''), '');
      expect(iraqiLocalDigits('abc'), '');
    });

    test('الرقم الكامل من الأرقام التسعة يجتاز قاعدة الخادم نفسها', () {
      expect(iraqiPhoneFromLocalDigits('701234567'), '07701234567');
      expect(normalizeIraqiPhone(iraqiPhoneFromLocalDigits('701234567')), '+9647701234567');
      // ٠٧٠–٠٧٤ مرفوضة كما في الخادم، ولو كانت تسعة أرقام.
      expect(isValidIraqiPhone(iraqiPhoneFromLocalDigits('001234567')), isFalse);
      expect(isValidIraqiPhone(iraqiPhoneFromLocalDigits('70123456')), isFalse, reason: 'ثمانية أرقام');
    });

    test('المُنسّق يطبّق التحويل على ما يُكتب ويضع المؤشّر في النهاية', () {
      const formatter = IraqiLocalDigitsFormatter();
      final out = formatter.formatEditUpdate(
        TextEditingValue.empty,
        const TextEditingValue(text: '+964 770 123 4567 x'),
      );
      expect(out.text, '701234567');
      expect(out.selection.baseOffset, 9);
      // ما هو صالحٌ أصلاً يمرّ كما هو بمؤشّره.
      const fine = TextEditingValue(text: '7012', selection: TextSelection.collapsed(offset: 2));
      expect(identical(formatter.formatEditUpdate(TextEditingValue.empty, fine), fine), isTrue);
    });
  });
}
