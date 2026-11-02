import 'package:flutter/material.dart';
import '../../../l10n/app_strings.dart';

import '../../tokens/app_dimens.dart';

/// شعار مجرة الأوتاكو.
///
/// [STAGE 12 · DECISION 02] كان الشعار صورةَ JPEG تُرسم بـ `BoxFit.cover`
/// مع `alignment: topCenter` داخل قصٍّ دائري — أي أن العمل الفني كان
/// **مقصوصاً**. وقفُ القصّ و`BoxFit.contain` قرارٌ قائم لم يتغيّر.
///
/// [التحديث] الأصل الآن **العلامة المربّعة بأرضيتها** —
/// `masters/otaku-square-mark.svg`، وهي «التهيئة الرسمية أ» في قفل
/// المرحلة ٠١: العلامة وحدها بلا نصّ، حبرُها يملأ ١/φ من البلاطة،
/// فالمساحة الآمنة (١٩٫١٪) مقيسةٌ داخل الأصل لا مضافةٌ هنا. الأرضية
/// مخبوزة عن قصد: هي أرضية العلامة المعتمدة (`#0B0718` شعاعياً) لا
/// خلفيةُ صورةٍ عرَضية كما كانت في عهد JPEG.
///
/// وهي التهيئة نفسها التي تحملها أيقونةُ التطبيق على أندرويد وiOS
/// والويب — فما يراه المستخدم في الإشعار وفي الترويسة صار شيئاً واحداً.
///
/// `BoxFit.contain` داخل `SizedBox.square` والأصل مربّع ١:١، فلا تمطيط
/// مهما كان [size].
///
/// [2026-09-14 · زوايا مستديرة على مستوى العرض] الأصل مربّعٌ بزوايا حادّة،
/// وعلى واجهةٍ كلُّ سطوحها مستديرة كان يبدو غريباً. القصّ هنا
/// (`ClipRRect` بنصف قطر [AppDimens.logoCornerRatio] × [size]) لا في ملف
/// الصورة: الأصل يبقى كما هو بايتاً بايتاً، والقصّ مستقلّ عن الكثافة ولا
/// يُعيد أخذ عيّنات البتّات، والزوايا المقصوصة أرضيةٌ محضة (العمل الفني داخل
/// المنطقة الآمنة ١٩٫١٪) فلا يُمسّ. ما يظهر خلف الزوايا هو خلفية الشاشة —
/// وهو ما يجعله طبيعياً على الفاتح والداكن معاً. [cornerRadius] يُخصَّص
/// لسطحٍ يحتاج مطابقةَ حاويته؛ `0` يُلغي الاستدارة.
class OtakuStoreLogo extends StatelessWidget {
  const OtakuStoreLogo({
    super.key,
    this.size = AppDimens.iconLogo,
    this.cornerRadius,
    @Deprecated('لا أثر له — الشعار عملٌ فني واحد بلا نصّ منفصل')
    this.showText = true,
    @Deprecated('لا أثر له') this.textSize,
    @Deprecated('لا أثر له') this.textColor,
    @Deprecated('من مفهوم شعار سابق (كوب قهوة) — لا أثر له') this.cupColor,
    @Deprecated('من مفهوم شعار سابق (كوب قهوة) — لا أثر له') this.steamColor,
    @Deprecated('لا أثر له — لا هالة على الشعار') this.glowEnabled = true,
    @Deprecated('لا أثر له — الشعار ساكن') this.animationDuration =
        AppDimens.durationSlow,
  });

  final double size;

  /// نصف قطر الزوايا؛ الافتراضي نسبةٌ من [size] (انظر [AppDimens.logoCornerRatio]).
  final double? cornerRadius;

  /// نصف القطر الفعلي المطبَّق في الرسم.
  double get effectiveCornerRadius =>
      cornerRadius ?? size * AppDimens.logoCornerRatio;

  // ═══ معطيات مهملة ═══
  //
  // ثمانية من تسعة لم يكن لها أثر في build() قبل هذا التحديث أيضاً؛ منها
  // cupColor و steamColor من عهد شعارٍ سابق. أُبقيت مع @Deprecated بدل
  // حذفها حتى لا ينكسر أيّ موضع نداء قائم — الحذف لاحقاً وبقرارٍ منفصل.
  final bool showText;
  final double? textSize;
  final Color? textColor;
  final Color? cupColor;
  final Color? steamColor;
  final bool glowEnabled;
  final Duration animationDuration;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: context.strings('brandName'),
      child: SizedBox.square(
        dimension: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(effectiveCornerRadius),
          clipBehavior: Clip.antiAlias,
          child: Image.asset(
            'assets/branding/otaku-square-mark.png',
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
          ),
        ),
      ),
    );
  }
}

class OtakuStoreLogoSimple extends StatelessWidget {
  const OtakuStoreLogoSimple({
    super.key,
    this.size = AppDimens.iconLogo,
    @Deprecated('لا أثر له — الشعار بألوانه المعتمدة دائماً') this.color,
  });

  final double size;

  /// [STAGE 12] لا أثر له وقصداً: الشعار لا يُعاد تلوينه في أيّ سياق.
  final Color? color;

  @override
  Widget build(BuildContext context) => OtakuStoreLogo(size: size);
}
