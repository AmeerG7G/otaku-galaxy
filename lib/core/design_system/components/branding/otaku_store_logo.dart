import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';

/// شعار مجرة الأوتاكو.
///
/// [STAGE 12 · DECISION 02] كان الشعار صورةَ JPEG تُرسم بـ `BoxFit.cover`
/// مع `alignment: topCenter` داخل قصٍّ دائري — أي أن العمل الفني كان
/// **مقصوصاً**، وأن JPEG لا يحمل شفافية فكان الشعار يجرّ خلفيته معه.
/// كلاهما يخالف قفل الشعار في المرحلة ٠١.
///
/// الآن: PNG شفاف، `BoxFit.contain`، بلا قصّ وبلا زوايا مستديرة. النسب
/// محفوظة والمساحة الآمنة (١٩٫١٪) جزء من العمل الفني نفسه.
class OtakuStoreLogo extends StatelessWidget {
  const OtakuStoreLogo({
    super.key,
    this.size = AppDimens.iconLogo,
    @Deprecated('لا أثر له — الشعار عملٌ فني واحد بلا نصّ منفصل')
    this.showText = true,
    @Deprecated('لا أثر له') this.textSize,
    @Deprecated('لا أثر له') this.textColor,
    @Deprecated('من مفهوم شعار سابق (كوب قهوة) — لا أثر له') this.cupColor,
    @Deprecated('من مفهوم شعار سابق (كوب قهوة) — لا أثر له') this.steamColor,
    @Deprecated('لا أثر له — لا هالة على الشعار') this.glowEnabled = true,
    @Deprecated('لا أثر له — الشعار ساكن') this.animationDuration =
        AppDimens.durationSlow,
    @Deprecated('لا أثر له — لم يبقَ قصٌّ يُستدار') this.cornerRadius,
  });

  final double size;

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
  final double? cornerRadius;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: 'مجرة الأوتاكو',
      child: SizedBox.square(
        dimension: size,
        child: Image.asset(
          'assets/branding/otaku-mark.png',
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
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
