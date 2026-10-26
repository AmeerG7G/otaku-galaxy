/// خطّا العلامة واحتياط الكردية المطابق لكلٍّ منهما — المصدر الوحيد.
///
/// [CRITICAL] Cairo ينقصه ێ ۆ ڕ ڵ ە، وTajawal ينقصه معها ک ژ گ — وهي في كل
/// كلمةٍ كردية تقريباً. المحرّك يأخذ المحرف الناقص من أول خطٍّ في
/// `fontFamilyFallback` يملكه، **ويأخذ السطر ارتفاع أطول خطٍّ عليه**. Noto
/// Sans Arabic الأصلي أطول سطراً من Cairo وأطول كثيراً من Tajawal، فكان
/// السطر الكردي أطول من العربي (Tajawal ١٤: ١٧ ← ٣٠ بكسل؛ ومع `height`
/// صريح ~١ بكسل لكل سطر) وتكبر كل حاويةٍ فيها كردية وتدفع ما تحتها.
///
/// الحلّ: لكلّ خطّ علامةٍ احتياطٌ بمقاييسه الرأسية هو — نسخة من Noto
/// حروفُها كما هي ومقاييس سطرها من خطّ العلامة
/// (`tool/fonts/make_metric_fallbacks.py`). فيتساوى السطر الكردي والعربي.
///
/// [CRITICAL] الربط **زوجٌ لا يُفكّ**: نصٌّ بخطّ Tajawal مع احتياط Cairo (أو
/// العكس) يعيد الفرق — السطر يأخذ مقاييس الاحتياط الأطول. لذلك لا تُكتب
/// `fontFamily:` في التطبيق إلا مع احتياطها من هنا:
///
/// ```dart
/// style.copyWith(
///   fontFamily: AppFonts.heading,
///   fontFamilyFallback: AppFonts.headingFallback,
/// )
/// ```
///
/// يحرسه `test/font_fallback_contract_test.dart`.
///
/// العربية لا تمرّ بالاحتياط أصلاً — كل حروفها في خطّ العلامة — فلا يتغيّر
/// منها بكسل.
abstract final class AppFonts {
  /// خطّ المتن والواجهة.
  static const String body = 'Cairo';

  /// خطّ العناوين والأرقام البارزة.
  static const String heading = 'Tajawal';

  /// احتياط الكردية لنصٍّ بخطّ [body].
  static const List<String> bodyFallback = <String>[
    'NotoSansArabicCairoMetrics',
  ];

  /// احتياط الكردية لنصٍّ بخطّ [heading].
  static const List<String> headingFallback = <String>[
    'NotoSansArabicTajawalMetrics',
  ];

  /// الاحتياط المطابق لعائلة [family] — `null` لعائلةٍ لا يعرفها النظام.
  static List<String>? fallbackFor(String? family) => switch (family) {
    body => bodyFallback,
    heading => headingFallback,
    _ => null,
  };
}
