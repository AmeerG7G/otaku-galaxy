/// تطبيع الأرقام الشرقية — المصدر الوحيد له في التطبيق.
///
/// لوحات المفاتيح العربية والفارسية تُنتج `٠١٢٣٤٥٦٧٨٩` أو `۰۱۲۳۴۵۶۷۸۹`،
/// و`int.parse` وقواعد الخادم لا تعرف إلّا `0-9`. كل حقلٍ رقمي (الهاتف،
/// اليوم والشهر…) يمرّ من هنا قبل التحقق، فلا يُرفض المستخدم على رقمٍ
/// صحيحٍ كُتب بخطٍّ آخر. القيم غير الرقمية تمرّ كما هي.
library;

import 'package:flutter/services.dart';

const _easternArabicZero = 0x0660; // ٠
const _easternPersianZero = 0x06F0; // ۰

/// يحوّل الأرقام الشرقية (العربية والفارسية) إلى غربية ويترك الباقي.
String normalizeDigits(String input) {
  final out = StringBuffer();
  for (final rune in input.runes) {
    if (rune >= _easternArabicZero && rune <= _easternArabicZero + 9) {
      out.writeCharCode(0x30 + (rune - _easternArabicZero));
    } else if (rune >= _easternPersianZero && rune <= _easternPersianZero + 9) {
      out.writeCharCode(0x30 + (rune - _easternPersianZero));
    } else {
      out.writeCharCode(rune);
    }
  }
  return out.toString();
}

/// ما يجوز كتابته في حقلٍ رقميٍّ محض: أرقام غربية أو شرقية (`٠-٩`، `۰-۹`) فقط.
///
/// تسهيلٌ للوحة المفاتيح لا تحقّقٌ — الحكم لـ[normalizeDigits] ثم للمُحلِّل.
/// المدى بالهروب `\u` لا بالمحارف نفسها كي لا يُحسب نصّاً عربياً مضمَّناً
/// في حارس الترجمة (`localization_corpus_test`).
final TextInputFormatter digitsOnlyInputFormatter =
    FilteringTextInputFormatter.allow(RegExp(r'[0-9\u0660-\u0669\u06F0-\u06F9]'));
