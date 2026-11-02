// الجدول المشترك `test/fixtures/iraqi_phone_vectors.json` على مرجعه: قاعدة
// الهاتف في التطبيق. المتجر الإلكتروني (`web-store/src/lib/phone.test.ts`)
// والخادم (`backend/tests/phone-vectors.test.ts`) يقرآن الملف نفسه — فإن تغيّر
// جوابٌ هنا فشل هناك أيضاً. هذا الاختبار لا يغيّر شيئاً في التطبيق.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/utils/iraqi_phone.dart';

void main() {
  final vectors =
      jsonDecode(File('test/fixtures/iraqi_phone_vectors.json').readAsStringSync())
          as Map<String, dynamic>;

  test('طول الحقل في الجدول هو طول التطبيق', () {
    expect(vectors['maxFieldLength'], kIraqiLocalPhoneLength);
  });

  test('normalizeIraqiPhone', () {
    for (final row in (vectors['normalize'] as List).cast<Map<String, dynamic>>()) {
      expect(normalizeIraqiPhone(row['raw'] as String), row['e164'], reason: jsonEncode(row['raw']));
    }
  });

  test('isValidIraqiLocalPhone', () {
    for (final row in (vectors['localField'] as List).cast<Map<String, dynamic>>()) {
      expect(isValidIraqiLocalPhone(row['raw'] as String), row['valid'], reason: jsonEncode(row['raw']));
    }
  });

  test('iraqiPhoneInputText (IraqiPhoneInputFormatter)', () {
    for (final row in (vectors['fieldInput'] as List).cast<Map<String, dynamic>>()) {
      expect(iraqiPhoneInputText(row['raw'] as String), row['text'], reason: jsonEncode(row['raw']));
    }
  });
}
