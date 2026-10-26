import 'package:flutter/material.dart';

import '../l10n/app_strings.dart';

String formatPrice(BuildContext context, num price) {
  return context.strings.p('priceIqd', {'amount': price.toStringAsFixed(0)});
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
/// السنة يضيف ضجيجاً لا معلومة. التحويل إلى التوقيت المحلي أولاً — الخادم
/// يرسل UTC، وموعدٌ في العاشرة مساءً يقع في اليوم التالي بلا ذلك.
String formatShortArabicDate(BuildContext context, DateTime date) {
  final local = date.toLocal();
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
