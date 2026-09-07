import 'package:flutter/material.dart';

String formatPrice(num price) {
  return '${price.toStringAsFixed(0)} د.ع';
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
const _arabicMonths = <String>[
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/// تاريخ قصير بالعربية: «١٥ سبتمبر».
///
/// بلا سنة عمداً: المواعيد المعروضة للزبون قريبة (موعد توفر منتج)، وذكرُ
/// السنة يضيف ضجيجاً لا معلومة. التحويل إلى التوقيت المحلي أولاً — الخادم
/// يرسل UTC، وموعدٌ في العاشرة مساءً يقع في اليوم التالي بلا ذلك.
String formatShortArabicDate(DateTime date) {
  final local = date.toLocal();
  return '${local.day} ${_arabicMonths[local.month - 1]}';
}

/// المدة المتبقية بصيغة عربية مختصرة («٥ ساعات»، «٤٠ دقيقة»).
String formatRemaining(Duration remaining) {
  if (remaining.inMinutes < 1) return 'أقل من دقيقة';
  if (remaining.inHours < 1) return _arabicCount(remaining.inMinutes, 'دقيقة', 'دقيقتان', 'دقائق');
  if (remaining.inHours < 24) return _arabicCount(remaining.inHours, 'ساعة', 'ساعتان', 'ساعات');
  return _arabicCount(remaining.inDays, 'يوم', 'يومان', 'أيام');
}

/// صيغة العدد العربية: مفرد ومثنّى وجمع. «٥ ساعات» لا «٥ ساعة».
String _arabicCount(int value, String one, String two, String many) {
  if (value == 1) return one;
  if (value == 2) return two;
  if (value <= 10) return '$value $many';
  return '$value $one';
}
