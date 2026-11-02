import 'package:flutter/material.dart';

import '../../features/products/domain/entities/product.dart';
import '../l10n/app_strings.dart';

String formatPrice(BuildContext context, num price) {
  return context.strings.p('priceIqd', {'amount': price.toStringAsFixed(0)});
}

/// سعر المنتج للعرض — أو «السعر لم يُعلن بعد» (084)، لا «٠ د.ع» أبداً.
String formatProductPrice(BuildContext context, Product product) =>
    product.priceAnnounced
        ? formatPrice(context, product.price)
        : context.strings('priceNotAnnounced');

/// إزاحة توقيت المتجر (بغداد) — UTC+03:00 ثابتة، العراق بلا توقيت صيفي منذ ٢٠٠٨.
const Duration storeUtcOffset = Duration(hours: 3);

/// اليوم التقويمي في توقيت المتجر — مستقلٌّ عن منطقة الجهاز الزمنية.
DateTime storeCalendarDate(DateTime instant) {
  final store = instant.toUtc().add(storeUtcOffset);
  return DateTime(store.year, store.month, store.day);
}

/// تاريخٌ تقويميّ رقمي `YYYY-MM-DD` بتوقيت المتجر — «٢٠٢٦-٠٧-٠٣» بأرقام غربية.
///
/// [CRITICAL] (STEP 77، طلب المالك 2026-10-31) موعد التوفر المتوقَّع يُعرض
/// رقمياً لا باسم الشهر، في كل لغة. اليوم من [storeCalendarDate] لا من توقيت
/// الجهاز: المسؤول يختار «٣ تموز» فيُخزَّن منتصف ليل بغداد (`21:00Z` من اليوم
/// السابق)، وهاتفٌ خارج العراق كان سيقرأ اليوم السابق.
String formatStoreIsoDate(DateTime instant) {
  final day = storeCalendarDate(instant);
  String two(int v) => v.toString().padLeft(2, '0');
  return '${day.year.toString().padLeft(4, '0')}-${two(day.month)}-${two(day.day)}';
}

void showSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// وقت خطوة في مسار الطلب: «٢٠٢٦/٠٨/٢٤ ١٤:٣٠».
///
/// صيغة صريحة بلا «منذ ساعتين»: العميل يتابع طلباً حقيقياً ويحتاج وقتاً
/// يقارنه بموعد وُعد به، لا وصفاً نسبياً يتغيّر كلما فتح الشاشة.
String formatOrderStepTime(DateTime at) {
  final local = at.toLocal();
  String two(int v) => v.toString().padLeft(2, '0');
  return '${local.year}/${two(local.month)}/${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

/// أسماء الشهور الميلادية بالعربية — مصدر واحد لكل الشاشات.
///
/// [CRITICAL] هنا وحدها. كتابةُ الأسماء في الودجة التي تحتاجها تعني نسخةً
/// ثانية تتباعد أول مرة يُصحَّح اسمُ شهر في إحداهما دون الأخرى، وتعني كذلك
/// أن الترجمة إلى لغة أخرى تحتاج مطاردةَ النسخ في الشجرة كلها.
const _monthKeys = <String>[
  'monthJanuary',
  'monthFebruary',
  'monthMarch',
  'monthApril',
  'monthMay',
  'monthJune',
  'monthJuly',
  'monthAugust',
  'monthSeptember',
  'monthOctober',
  'monthNovember',
  'monthDecember',
];

/// تاريخ قصير بالعربية: «١٥ سبتمبر».
///
/// بلا سنة عمداً: المواعيد المعروضة للزبون قريبة (موعد توفر منتج)، وذكرُ
/// السنة يضيف ضجيجاً لا معلومة.
///
/// [CRITICAL] (2026-10-26) اليوم في **توقيت المتجر** (بغداد) لا الجهاز: المسؤول
/// يختار «١٣ أكتوبر» فيُخزَّن منتصف ليل بغداد (`21:00Z` من اليوم السابق).
/// بتوقيت الجهاز كان هاتفٌ خارج العراق يقول «١٢ أكتوبر».
String formatShortArabicDate(BuildContext context, DateTime date) {
  final local = storeCalendarDate(date);
  return context.strings.p('shortDate', {
    'day': '${local.day}',
    'month': context.strings(_monthKeys[local.month - 1]),
  });
}

/// المدة المتبقية بصيغة عربية مختصرة («٥ ساعات»، «٤٠ دقيقة»).
String formatRemaining(BuildContext context, Duration remaining) {
  if (remaining.inMinutes < 1) return context.strings('lessThanAMinute');
  if (remaining.inHours < 1) {
    return _count(context, remaining.inMinutes, 'Minute');
  }
  if (remaining.inHours < 24) return _count(context, remaining.inHours, 'Hour');
  return _count(context, remaining.inDays, 'Day');
}

/// صيغة العدد العربية: مفرد ومثنّى وجمع. «٥ ساعات» لا «٥ ساعة».
///
/// [CRITICAL] التفريع نفسه محفوظ حرفاً بحرف. المثنّى بابٌ عربيٌّ لا يقابله
/// شيء في السوراني، فالكردية ستضع القيمة ذاتها في الصيغ الثلاث؛ وهذا قرارُ
/// ترجمةٍ يُتَّخذ في `_ckb` لا هنا. حذفُ الفرع لأن لغةً واحدة لا تحتاجه
/// كان سيُفسد العربية.
String _count(BuildContext context, int value, String unit) {
  if (value == 1) return context.strings('unit${unit}One');
  if (value == 2) return context.strings('unit${unit}Two');
  return context.strings.p('countWithUnit', {
    'count': '$value',
    'unit': context.strings(value <= 10 ? 'unit${unit}Many' : 'unit${unit}One'),
  });
}
