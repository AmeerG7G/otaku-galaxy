import '../../features/settings/presentation/cubit/locale_cubit.dart';

/// محتوى ديناميكي بلغتين يأتي من الخادم — اسم منتج، وصفه، ولقطة اسمه في
/// طلبٍ أو تقييم.
///
/// [CRITICAL] **ليس** نصَّ واجهة. نصوص الواجهة («اسم المنتج»، «الوصف») في
/// `AppStrings`؛ أما محتوى الكتالوج فمصدره قاعدة البيانات (هجرة ٠٦٦) ولا يدخل
/// ملفات الترجمة أبداً. هذا النوع هو الجسر الوحيد بين الاثنين: يحمل ما قاله
/// الخادم باللغتين، ويختار بلغة الواجهة الحالية.
///
/// العربية مرجعٌ حاضر دائماً. الكردية `null` حين تنقص — منتجٌ أقدم من إلزام
/// الحقول الأربعة، أو لقطة طلبٍ أقدم منه — غيابٌ **معلَن** ([isFallbackIn])
/// لا نصٌّ مختلَق ولا عربيٌّ منسوخ في حقل الكردية.
class BilingualText {
  const BilingualText({required this.ar, String? ckb})
    : ckb = ckb == null || ckb == '' ? null : ckb;

  /// يقرأ حقلين صريحين من ردّ الخادم (`nameAr`/`nameCkb` مثلاً).
  ///
  /// الكردية الفارغة أو المسافات وحدها تُقرأ `null` — القاعدة نفسها التي
  /// يطبّقها الخادم (`kurdishOrNull`)، فلا يُعرض سطرٌ فارغ على أنه «الكردية».
  ///
  /// [legacyKey]: ردٌّ أقدم من 066 لا يحمل إلا نصاً واحداً (`name`) محسوماً
  /// بلغة الطلب. يُقرأ نصاً وحيداً بلا كردية — عرضٌ صحيح بلغة ذلك الطلب حتى
  /// يُجلب الردّ الجديد، لا انهيار.
  factory BilingualText.fromJson(
    Map<String, dynamic> json, {
    required String arKey,
    required String ckbKey,
    String? legacyKey,
  }) {
    final ar =
        json[arKey]?.toString() ??
        (legacyKey == null ? null : json[legacyKey]?.toString()) ??
        '';
    final rawCkb = json[ckbKey]?.toString();
    return BilingualText(
      ar: ar,
      ckb: rawCkb == null || rawCkb.trim().isEmpty ? null : rawCkb,
    );
  }

  /// النصّ العربي — المرجع، حاضرٌ دائماً (قد يكون فارغاً لوصفٍ قديم).
  final String ar;

  /// النصّ الكردي (سوراني) كما كتبه المسؤول، أو `null` = ناقص. لا فراغ أبداً.
  final String? ckb;

  /// هل للنصّ صورة كردية؟
  bool get hasKurdish => ckb != null;

  /// [CRITICAL] **الاختيار الوحيد** للغة المحتوى في التطبيق.
  ///
  /// نفس قاعدة الخادم (`pickLocalized`): الكردية الحاضرة للواجهة الكردية،
  /// وإلا العربية. كل شاشة تسمّي منتجاً تمرّ من هنا ولا تقرّر بنفسها — قاعدتان
  /// مكتوبتان في عشر شاشات تتباعدان أول مرة تُعدَّل إحداها.
  String of(AppLanguage language) =>
      language == AppLanguage.kurdish && ckb != null ? ckb! : ar;

  /// هل يُعرض العربي بهذه اللغة **مكان** كرديٍّ ناقص؟
  ///
  /// لإعلان النقص (تنبيهٌ في تفاصيل المنتج) لا لإخفائه: العربي يُعرض لأنه
  /// المتاح، لا لأنه «الكردية».
  bool isFallbackIn(AppLanguage language) =>
      language == AppLanguage.kurdish && ckb == null;

  @override
  bool operator ==(Object other) =>
      other is BilingualText && other.ar == ar && other.ckb == ckb;

  @override
  int get hashCode => Object.hash(ar, ckb);

  @override
  String toString() => 'BilingualText(ar: $ar, ckb: $ckb)';
}

/// [CRITICAL] اختيار نصٍّ **كلتا لغتيه اختيارية** — نصّ البنر (هجرة ٠٦٧).
///
/// [BilingualText] يفترض عربيةً حاضرة دائماً (اسم منتج). نصّ البنر ليس كذلك:
/// المسؤول قد يكتب لغةً دون أخرى، أو لا يكتب نصاً أصلاً. فالقاعدة متناظرة:
/// لغة الواجهة إن حضرت، وإلا الأخرى، وإلا `null` (فتعرض الواجهة نصّها
/// الافتراضي). الفراغ والمسافات غياب. نفس قاعدة الخادم (`pickLocalizedEither`)
/// فيطابق ما يختاره التطبيقُ `title` الذي يحسمه الخادم بلغة الطلب.
///
/// كل شاشة تعرض نصّ بنر تمرّ من هنا (عبر `Banner.titleIn`/`subtitleIn`)
/// ولا تقرّر اللغة بنفسها.
String? pickEitherLanguage({
  required String? ar,
  required String? ckb,
  required AppLanguage language,
}) {
  final arabic = _presentText(ar);
  final kurdish = _presentText(ckb);
  return language == AppLanguage.kurdish
      ? (kurdish ?? arabic)
      : (arabic ?? kurdish);
}

String? _presentText(String? text) {
  final trimmed = text?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}
