import '../../../../core/l10n/gender.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';

/// مستوى في سلّم نقاط المجرّة كما يرسله الخادم.
///
/// كان هذا الملف `enum` يحمل الأسماء والعتبات مخبوزةً في التطبيق ويشتقّ
/// المستوى حسابياً، ثم صار عارضاً لسلّمٍ يديره المسؤول من اللوحة. السلّم
/// اليوم **قاعدة تجارية ثابتة** يعرّفها الخادم في `domain/galaxyPoints.ts`:
/// سبعة مستويات لا تُضبط من أي واجهة.
///
/// يبقى هذا الصنف عارضاً لا مصدراً للحقيقة: لا عتبات محلية ولا قيم افتراضية.
/// الجديد أنه يحمل **صيغ الاسم الثلاث** ويختار بينها بجنس صاحب الحساب —
/// وهو قرار عرضٍ محض، ولذلك يعيش هنا لا في الخادم.
///
/// [CRITICAL] ويحمل الصيغة الكردية الواحدة ويختارها بلغة الواجهة — بنفس
/// قرار `Gendered.ofLocale`: الكردية لا تسأل عن الجنس، والعربية تسأل. كانت
/// الأسماء تُختار بالجنس وحده فظهر «مستكشف المجرة» في شاشةٍ كردية.
class OtakuLevel {
  const OtakuLevel({
    required this.key,
    required this.number,
    required this.nameMale,
    required this.nameFemale,
    required this.nameNeutral,
    required this.reward,
    required this.rewardKind,
    required this.threshold,
    this.nameCkb = '',
    this.rewardCkb = '',
  });

  /// معرّف المستوى المستقر (`beginner`, `explorer`, …).
  ///
  /// [CRITICAL] كل منطق يمرّ على هذا لا على الاسم: الاسم نصُّ عرضٍ يتغيّر
  /// بجنس القارئ، ومقارنةُ نصوصٍ معروضة منطقٌ ينكسر أول مرة تتغيّر صياغة.
  final String key;

  /// رقم المستوى المعروض (١..٧).
  final int number;

  /// اسم المستوى للمخاطَب المذكّر (مثل «بطل المجرة»).
  final String nameMale;

  /// اسم المستوى للمخاطَبة المؤنّثة (مثل «بطلة المجرة»).
  final String nameFemale;

  /// صيغة محايدة لمن لم يحدّد جنسه (مثل «مستوى البطولة»).
  final String nameNeutral;

  /// وصف المزيّة المرتبطة بالمستوى.
  final String reward;

  /// نوع المزيّة: `none` أو `discount` أو `gift`.
  final String rewardKind;

  /// أقل رصيد نقاط يفتح هذا المستوى.
  final int threshold;

  /// الاسم الكردي الواحد — فارغٌ لردٍّ قديم لا يحمله، فتسقط الواجهة إلى
  /// العربية بدل فراغ.
  final String nameCkb;

  /// وصف المزيّة بالكردية — نظير [reward].
  final String rewardCkb;

  /// الاسم بالصيغة المناسبة لقارئٍ بعينه **وبلغة واجهته**.
  ///
  /// الكردية لا تسأل عن الجنس؛ والعربية تسأل. غيابُ الكردية يُسقط إلى
  /// العربية المصرَّفة — نصٌّ ظاهر أفضل من فراغ، وهي الحالة الوحيدة المقبولة.
  String nameFor(AppGender gender, [AppLanguage language = AppLanguage.arabic]) {
    if (language == AppLanguage.kurdish && nameCkb.trim().isNotEmpty) {
      return nameCkb;
    }
    return switch (gender) {
      AppGender.male => nameMale,
      AppGender.female => nameFemale,
      AppGender.unknown => nameNeutral,
    };
  }

  /// وصف المزيّة بلغة الواجهة.
  String rewardFor(AppLanguage language) =>
      language == AppLanguage.kurdish && rewardCkb.trim().isNotEmpty
          ? rewardCkb
          : reward;

  bool get hasReward => rewardKind != 'none';

  factory OtakuLevel.fromJson(Map<String, dynamic> json) {
    final male = json['nameMale']?.toString() ?? '';
    return OtakuLevel(
      key: json['key']?.toString() ?? '',
      number: (json['number'] as num?)?.toInt() ?? 0,
      nameMale: male,
      // الصيغتان الأخريان تسقطان إلى المذكّرة لو غابتا عن ردٍّ قديم: نصٌّ
      // ظاهر أفضل من فراغ، وهي الحالة الوحيدة التي يُقبل فيها ذلك.
      nameFemale: json['nameFemale']?.toString() ?? male,
      nameNeutral: json['nameNeutral']?.toString() ?? male,
      reward: json['reward']?.toString() ?? '',
      rewardKind: json['rewardKind']?.toString() ?? 'none',
      threshold: (json['requiredPoints'] as num?)?.toInt() ?? 0,
      nameCkb: json['nameCkb']?.toString() ?? '',
      rewardCkb: json['rewardCkb']?.toString() ?? '',
    );
  }

  @override
  bool operator ==(Object other) => other is OtakuLevel && other.key == key;

  @override
  int get hashCode => key.hashCode;
}
