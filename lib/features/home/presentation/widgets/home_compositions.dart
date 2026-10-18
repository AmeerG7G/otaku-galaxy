import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../../../core/l10n/app_strings.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/character_artwork.dart';
import '../../../products/domain/entities/banner.dart' as model;
import '../../../settings/presentation/cubit/locale_cubit.dart';

/// عنوان قسم بتصميم v2: عنوان عريض بخط Tajawal + رابط «عرض الكل» اختياري.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.onSeeAll});

  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontSize: 18,
                fontWeight: AppDimens.weightExtraBold,
              ),
            ),
          ),
          if (onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: Text(
                context.strings('seeAll'),
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  fontSize: 12.5,
                  fontWeight: AppDimens.weightBold,
                  color: AppColors.secondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// رسم البنر — صورة المسؤول، أو شخصية الموضع حين لا صورة أو فشل تحميلها —
/// محصوراً داخل البطاقة، على جهة النهاية (اليسار في RTL) وموسَّطاً عمودياً.
///
/// [CRITICAL] كان الرسم `PositionedDirectional(bottom: سالب، end: سالب)` بلا
/// عرضٍ أقصى، فيخرج من يسار البطاقة ومن أسفلها ويقصّه `clipBehavior` — جزءٌ
/// من الشخصية لا يُرى أبداً. الآن يُعطى صندوقاً داخل البطاقة من الجهات الأربع
/// ([insetFor])، فيُصغَّر الارتفاع المطلوب إلى ما يتّسع له الصندوق بدل أن
/// يُقصّ، ولا يتجاوز العرضُ البطاقة مهما كانت نسبة الصورة المرفوعة.
class _BannerArt extends StatelessWidget {
  const _BannerArt({
    required this.slot,
    required this.height,
    required this.cornerRadius,
    this.imageUrl,
    this.start,
  });

  /// فتحة الشخصية المضمَّنة — تُعرض حين لا صورة أو فشل تحميلها. `null`:
  /// لا شخصية احتياطية (البطاقة الترويجية الأولى منذ حذف الصورة 4).
  final String? slot;

  /// الارتفاع المطلوب — سقفٌ لا وعد: البطاقة الأقصر تُصغّره ولا تقصّه.
  final double height;

  /// نصف قطر زاوية البطاقة — يحدّد أصغر إزاحة آمنة.
  final double cornerRadius;
  final String? imageUrl;

  /// حدّ الصندوق من جهة البداية — حيث ينتهي نصّ البطاقة. `null`: إزاحة الزاوية
  /// كالجهات الثلاث الأخرى. الرسم الأعرض من الباقي يُصغَّر ولا يدخل تحت النصّ.
  final double? start;

  /// أصغر إزاحةٍ متساوية عن حافّتين تُبقي زاوية الرسم داخل انحناء زاوية
  /// البطاقة: r·(1 − 1/√2). أقلّ منها وتقصّ الزاويةُ المدوَّرة طرفَ الصورة.
  static double insetFor(double cornerRadius) =>
      cornerRadius * (1 - math.sqrt1_2);

  @override
  Widget build(BuildContext context) {
    final inset = insetFor(cornerRadius);
    final slot = this.slot;
    final Widget fallback = slot == null
        ? const SizedBox.shrink()
        : CharacterArtwork(slot: slot, height: height);
    return PositionedDirectional(
      top: inset,
      bottom: inset,
      start: start ?? inset,
      end: inset,
      // `Align` يمرّر قيوداً فضفاضة: الارتفاع المطلوب يُقصر على المتاح،
      // والعرض المشتقّ من نسبة الصورة يُقصر على عرض البطاقة.
      //
      // [STEP 64 §17] موسَّطٌ عمودياً لا مثبَّتٌ في القاع. ارتفاع البطاقة يتبع
      // نصّها: ١٩٧ بالعربية بخطٍّ عادي، ٢١٠–٢٦٣ بخطّ الهاتف المكبَّر (١٫١٥–١٫٣)،
      // و٢٣٩–٢٨٠ بالكردية. التثبيت في القاع كان يترك فوق الشخصية شريطاً فارغاً
      // حتى ١٠١ بكسل (مقيس) — «الشخصية نازلة». التوسيط يوزّع الفراغ بالتساوي
      // فوقها وتحتها في كل بنرٍ يستعمل هذا المكوّن الآن ولاحقاً، ويبقى الرسم
      // داخل الصندوق المُزاح من الزوايا فلا يُقصّ.
      child: Align(
        alignment: AlignmentDirectional.centerEnd,
        child: imageUrl != null
            ? Image.network(
                imageUrl!,
                height: height,
                fit: BoxFit.contain,
                alignment: AlignmentDirectional.centerEnd,
                // فشل تحميل صورة البنر يعود للشخصية المضمَّنة بدل ترك فجوة.
                errorBuilder: (_, _, _) => fallback,
              )
            : fallback,
      ),
    );
  }
}

/// بطاقة البطل في الرئيسية — تدرّج وردي→بنفسجي→أزرق مع رسم شخصية في
/// زاويتها. الرسم تزييني خلف المحتوى ولا يُستخدم كصورة منتج.
class HomeHeroCard extends StatelessWidget {
  const HomeHeroCard({super.key, required this.onShop, this.banner});

  final VoidCallback onShop;

  /// بنر البطل الذي يديره المسؤول. `null` يعني «لم يُضبط»، فيبقى التصميم
  /// المضمَّن كما هو — لا لوحة فارغة ولا نص نائب.
  final model.Banner? banner;

  /// أقصى عرضٍ لعمود النصّ.
  static const double textColumnMax = 190;

  /// حشوة النصّ من جهة البداية — الرسم لا يتجاوز ما بعدها.
  static const double textStart = 22;

  /// حشوة الكبسولة وزرّ «تسوّق الآن» الأفقية (من الجهتين معاً).
  static const double _kickerPadding = 22;
  static const double _ctaPadding = 38;

  /// عرض عمود النصّ في بطاقةٍ بعرض [cardWidth]: [textColumnMax]، أو ما بين
  /// حشوتيه إن ضاقت البطاقة.
  ///
  /// [CRITICAL] (2026-10-13) لا يضيق بنسبة البطاقة. عمودٌ بـ٥٢٪ منها (نسبة
  /// المرجع) كان ١٤٣٫٥ عند ٣٢٠، فالتفّ العنوان عند ×١٫٣ سطراً رابعاً بكل لغة،
  /// وطالت البطاقة ٣٩، ونزل زرّ «تسوّق الآن» تحت شريط التنقّل. ما يُبعد
  /// الشخصية عن النصّ هو العرض المحجوز له أدناه، لا تضييق العمود.
  static double textColumnFor(double cardWidth) =>
      math.max(0, math.min(textColumnMax, cardWidth - 2 * textStart));

  @override
  Widget build(BuildContext context) {
    // نصّ البنر بلغة الواجهة الآن — الكردية الناقصة تسقط إلى العربية والعكس.
    final title = banner?.titleIn(context.language);
    final subtitle = banner?.subtitleIn(context.language);
    // [CRITICAL] (البوّابة ٥، 2026-10-10) نصّا البطل منطقتان تحجزان ما تحتاجه
    // أطول ترجمتيهما (`BoundedText.reserveFor`): ارتفاع البطاقة يتبع النصّ،
    // والشخصية موسَّطةٌ فيها — عنوانٌ كردي أطول بسطرٍ كان يطيلها ٣٩ ويُنزل
    // الشخصية ١٩٫٥ عند ×١٫٣. الأطول يُصغَّر أولاً حتى ٠٫٨، ولا يُحجز سطرٌ
    // زائد بكل لغة إلا لما لا يتّسع حتى عنده.
    final titles = [
      for (final l in AppLanguage.values)
        banner?.titleIn(l) ?? AppStrings.of(l)('heroNewSeason'),
    ];
    final subtitles = [
      for (final l in AppLanguage.values)
        banner?.subtitleIn(l) ?? AppStrings.of(l)('heroNewCollection'),
    ];
    final kicker = BoundedText(
      subtitle ?? context.strings('heroNewCollection'),
      maxLines: 2,
      reserveFor: subtitles,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        fontSize: 10.5,
        fontWeight: AppDimens.weightExtraBold,
        color: Colors.white,
      ),
    );
    final heading = BoundedText(
      title ?? context.strings('heroNewSeason'),
      maxLines: 6,
      reserveFor: titles,
      alignment: AlignmentDirectional.topStart,
      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
        fontSize: 23,
        height: 1.3,
        fontWeight: AppDimens.weightBlack,
        color: Colors.white,
      ),
    );
    final ctaStyle = Theme.of(context).textTheme.labelMedium?.copyWith(
      fontSize: 12.5,
      fontWeight: AppDimens.weightExtraBold,
      color: const Color(0xFF25123F),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final column = textColumnFor(constraints.maxWidth);
          // [CRITICAL] (2026-10-12) النصّ والشخصية لا يتداخلان، بأي مقاسٍ
          // ولغة: الرسم يبدأ حيث ينتهي أعرض ما يأخذه العمود بأيّ ترجمة
          // (الكبسولة، العنوان، الزرّ)، ويُصغَّر إلى ما يبقى بدل أن يدخل تحت
          // النصّ — كما يُصغَّر حين تقصر البطاقة. كان صندوقه البطاقةَ كلّها،
          // فيقع العنوان على يده عند ٤١٢ وعلى ذراعه ووجهه عند ٣٢٠ × ١٫٣، والكردي
          // على ضفيرتها حتى عند ٤١٢. العرض المحجوز لا يتغيّر باللغة، فلا يتحرّك
          // الرسم بتغيّرها.
          final textWidth = [
            kicker.reservedWidth(
                  context,
                  math.max(0, column - _kickerPadding),
                ) +
                _kickerPadding,
            heading.reservedWidth(context, column),
            _ctaWidth(context, ctaStyle, column),
          ].reduce(math.max);
          return Container(
            constraints: const BoxConstraints(minHeight: 174),
            decoration: BoxDecoration(
              gradient: AppColors.animeHeroGradient,
              borderRadius: BorderRadius.circular(AppDimens.radiusXl),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.30),
                  blurRadius: 40,
                  offset: const Offset(0, 20),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                PositionedDirectional(
                  top: -40,
                  start: -30,
                  child: Container(
                    width: 170,
                    height: 170,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                  ),
                ),
                // صورة البنر التي يرفعها المسؤول تحلّ محلّ الشخصية المضمَّنة،
                // في الموضع والمقاس نفسيهما.
                _BannerArt(
                  slot: VisualSlots.homeHero,
                  imageUrl: banner?.imageUrl,
                  height: 168,
                  cornerRadius: AppDimens.radiusXl,
                  start: textStart + textWidth,
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    textStart,
                    22,
                    textStart,
                    24,
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: column),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: _kickerPadding / 2,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.26),
                            borderRadius: BorderRadius.circular(
                              AppDimens.radiusFull,
                            ),
                          ),
                          child: kicker,
                        ),
                        const SizedBox(height: AppDimens.space4),
                        heading,
                        const SizedBox(height: AppDimens.space4),
                        GestureDetector(
                          onTap: onShop,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: _ctaPadding / 2,
                              vertical: 11,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(
                                AppDimens.radiusFull,
                              ),
                            ),
                            child: Text(
                              context.strings('shopNow'),
                              style: ctaStyle,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  /// أعرض ما يأخذه زرّ «تسوّق الآن» بأيّ ترجمة في عمودٍ بعرض [column].
  static double _ctaWidth(
    BuildContext context,
    TextStyle? style,
    double column,
  ) {
    var widest = 0.0;
    for (final label in AppStrings.across('shopNow')) {
      final painter = TextPainter(
        text: TextSpan(
          text: label,
          style: DefaultTextStyle.of(context).style.merge(style),
        ),
        textScaler: MediaQuery.textScalerOf(context),
        textDirection: Directionality.of(context),
      )..layout(maxWidth: math.max(0, column - _ctaPadding));
      widest = math.max(widest, painter.width + _ctaPadding);
      painter.dispose();
    }
    return widest;
  }
}

/// الشريط الترويجي تحت البطل.
///
/// عدد البطاقات ليس ثابتاً: يضيف المسؤول ما يشاء من لوحة التحكم ويرتّبها.
/// حين لا يضبط شيئاً تظهر بطاقة «خصومات فعّالة» وحدها، مشتقّةً من خصمٍ حقيقي
/// في الكتالوج؛ وبلا خصمٍ حقيقي لا يظهر الشريط إطلاقاً.
///
/// [PRODUCT] أُزيلت البطاقة الترويجية الأولى المضمَّنة (2026-09-28): نصٌّ
/// تسويقيّ ثابت في الكود يظهر في التطبيق ولا يراه المسؤول في اللوحة ولا
/// يستطيع إزالته. الترويج اليدوي مكانه بنرات `promo` من اللوحة.
class HomePromoRail extends StatelessWidget {
  const HomePromoRail({
    super.key,
    required this.onTap,
    this.maxDiscount,
    this.banners = const <model.Banner>[],
    this.onOpenBanner,
  });

  final VoidCallback onTap;

  /// أعلى نسبة خصم حقيقية في الكتالوج. `null` يعني لا خصومات فعلية الآن،
  /// فلا نعرض بطاقة الخصومات إطلاقاً بدل ادّعاء نسبة غير موجودة.
  final int? maxDiscount;

  /// البطاقات التي يديرها المسؤول، بترتيبه.
  final List<model.Banner> banners;

  /// فتح وجهة البنر — الوجهة بيانات، والتنقّل مسؤولية الشاشة.
  final void Function(model.Banner banner)? onOpenBanner;

  /// تدرّجات البطاقات المُدارة — تدور على اللوحة نفسها فتتنوّع بلا إعداد.
  // [STAGE 12] تزيينية بحتة لا دلالة حالة فيها، فالأخضر هنا كان يُستعمل
  // لوناً لا إشارة — أُبدل بالنيلي تبعاً للزوج ٢ في لوحة الأقسام.
  static const List<List<Color>> _palettes = [
    [AppColors.accentCyan, AppColors.primary],
    [AppColors.accent, AppColors.secondary],
    [AppColors.accentCyan, AppColors.indigo],
    [AppColors.accentOrange, AppColors.secondary],
  ];

  /// ارتفاع البطاقة عند مقياس خطٍّ عادي — من المرجع:
  /// `width:196px;height:112px`.
  static const double _cardHeight = 112;

  /// حشوة البطاقة الرأسية — من المرجع: `padding:16px … 16px …`.
  static const double _cardVerticalPadding = 32;

  /// الفراغ فوق الصفّ — من المرجع: `padding:14px 18px 0` على **الحاوية**،
  /// أي **خارج** البطاقة لا داخلها.
  static const double _railTopPadding = 14;

  /// ارتفاع البطاقة لمقياس خطٍّ معلوم.
  ///
  /// [CRITICAL] الجزء النصّي وحده يكبر مع مقياس الخط؛ الحشوة لا تتأثر، فلا
  /// يُضاعَف الارتفاع كلّه. نفس ما يفعله [productCardExtentFor] لبطاقة
  /// المنتج — ارتفاعٌ ثابت لكل المقاييس يعني أن من كبّر خطّ جهازه يرى نصّاً
  /// مقصوصاً، ومن لم يكبّره يدفع ثمن فراغٍ لا يحتاجه.
  static double cardHeightFor(double textScale) =>
      _cardVerticalPadding +
      (_cardHeight - _cardVerticalPadding) * textScale.clamp(1.0, maxTextScale);

  /// أعلى مقياس خطٍّ يحجز له [cardHeightFor] ارتفاعاً — ونصّ البطاقة لا
  /// يُرسم بأكبر منه، وإلا كبر النصّ فوق ارتفاعٍ توقّف عن الكبر.
  static const double maxTextScale = 1.6;

  @override
  Widget build(BuildContext context) {
    final managed = banners;
    // بلا بنرات مُدارة ولا خصمٍ حقيقي لا شيء يُعرض — لا صفّ فارغ بارتفاعه.
    if (managed.isEmpty && maxDiscount == null) return const SizedBox.shrink();
    final textScale = MediaQuery.textScalerOf(context).scale(14) / 14;
    final cardHeight = cardHeightFor(textScale);
    return SizedBox(
      // [CRITICAL] الارتفاع = البطاقة + الفراغ فوقها، لا البطاقة وحدها.
      //
      // كان `112` فقط، والقائمة تأخذ منه ١٤ حشوةً علوية — فتبقى للبطاقة ٩٨
      // بدل ١١٢، ولمحتواها ٦٦ بدل ٨٠ بعد حشوة ١٦ علواً وسفلاً. والنصّان
      // (١٦ ثم ٤ ثم ١١٫٥ بارتفاعَي سطرَيهما) يحتاجان ٦٩، فيفيض ٣ بكسل.
      //
      // أي أن الرقم المرجعي طُبِّق على الصفّ بدل البطاقة: ١٤ الحشوة العلوية
      // في المرجع تقع على الحاوية (`padding:14px 18px 0`) خارج البطاقة،
      // والبطاقة ١١٢ كاملة. جمعُهما يعيد الهندسة المرجعية حرفياً ويترك
      // للنصّ ٨٠ بدل ٦٦ — بلا قصّ، وبلا تصغير خطّ، وبلا إخفاء تجاوز.
      height: cardHeight + _railTopPadding,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(18, _railTopPadding, 18, 0),
        children: managed.isNotEmpty
            ? [
                for (final (index, banner) in managed.indexed) ...[
                  if (index > 0) const SizedBox(width: AppDimens.space4),
                  _PromoCard(
                    title:
                        banner.titleIn(context.language) ??
                        context.strings('promoBadge'),
                    subtitle: banner.subtitleIn(context.language) ?? '',
                    // الأولى بلا شخصية احتياطية: كانت الصورة 4، وحُذفت
                    // (2026-09-28) — صورة البنر المرفوعة وحدها تُعرض.
                    slot: index == 0 ? null : VisualSlots.homePromoSecondary,
                    imageUrl: banner.imageUrl,
                    height: cardHeight,
                    colors: _palettes[index % _palettes.length],
                    onTap: () => banner.isTappable && onOpenBanner != null
                        ? onOpenBanner!(banner)
                        : onTap(),
                  ),
                ],
              ]
            : [
                _PromoCard(
                  title: context.strings('promoActiveDiscounts'),
                  subtitle: context.strings.p('promoUpToDiscount', {
                    'percent': '$maxDiscount',
                  }),
                  slot: VisualSlots.homePromoSecondary,
                  height: cardHeight,
                  colors: _palettes[1],
                  onTap: onTap,
                ),
              ],
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({
    required this.title,
    required this.subtitle,
    required this.slot,
    this.imageUrl,
    required this.colors,
    required this.onTap,
    required this.height,
  });

  /// ارتفاع البطاقة — يحسبه الصفّ مرة واحدة من مقياس الخط.
  final double height;

  final String title;
  final String subtitle;

  /// فتحة شخصية هذه البطاقة حين لا صورة بنر — `null` للأولى (بلا شخصية).
  final String? slot;

  /// صورة البنر إن رفعها المسؤول — تحلّ محلّ رسم الفتحة.
  final String? imageUrl;
  final List<Color> colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 196,
        height: height,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: colors,
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          boxShadow: context.themeColors.shadowSoft,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            _BannerArt(
              slot: slot,
              imageUrl: imageUrl,
              height: 110,
              cornerRadius: AppDimens.radiusLg,
            ),
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 76, 16),
              // [CRITICAL] صندوق النصّ ثابت: ١٠٤ عرضاً (١٩٦ − ١٦ − ٧٦) و٨٠
              // ارتفاعاً عند مقياس ١. كان النصّان بلا حدّ أسطر، فعنوان بنرٍ من
              // اللوحة يلتفّ ثلاثة أسطر (٧٢) + ٤ + سطر عنوانٍ فرعي **فارغ**
              // يحجز ١٧ = ٩٣، أي تجاوز ١٣ بكسل. الحدّ الآن هو ما يحجزه
              // الارتفاع: سطرا عنوان + سطر فرعي (٦٩ عربياً، ٧٦ كردياً ≤ ٨٠)،
              // والفرعي الفارغ لا يُرسم. والخطّ لا يكبر فوق ما حُسب له الارتفاع.
              child: MediaQuery.withClampedTextScaling(
                maxScaleFactor: HomePromoRail.maxTextScale,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontSize: 16,
                        fontWeight: AppDimens.weightBlack,
                        color: Colors.white,
                      ),
                    ),
                    if (subtitle.trim().isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 11.5,
                          color: Colors.white.withValues(alpha: 0.88),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// مفتاح طبقة النسخة العلوية لبطاقة التوصيل (للاختبارات).
const deliveryOverlayKey = ValueKey<String>('delivery_overlay_11');

/// شريط طمأنة التوصيل والدفع عند الاستلام.
class DeliveryAssuranceStrip extends StatelessWidget {
  const DeliveryAssuranceStrip({super.key});

  @override
  Widget build(BuildContext context) {
    final borderColor = Theme.of(context).colorScheme.outlineVariant;
    final borderRadius = BorderRadius.circular(AppDimens.radiusLg);

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 0),
      // Outer Stack: the card (Container) sizes it, and [_deliveryOverlay] is its
      // LAST child so it paints above the card, its border and the artwork.
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: borderRadius,
        ),
        // Border lives in foregroundDecoration.  Flutter's Container.build places
        // the foregroundDecoration DecoratedBox OUTSIDE the ClipPath it creates
        // for clipBehavior, so the border paints after the clip is restored —
        // it is never clipped itself and always renders on top of every child.
        foregroundDecoration: BoxDecoration(
          borderRadius: borderRadius,
          border: Border.all(color: borderColor),
        ),
        // Clip.antiAlias clips the Stack's children (including overflowing artwork)
        // to the card's rounded-rectangle boundary.  The artwork's portion that
        // extends below / past the card's outer edge is invisible — it appears to
        // go "behind" the card — and the foregroundDecoration border (outside the
        // clip) paints on top of the visible artwork at the card's edges.
        //
        // Do NOT change this to Clip.none: with Clip.none the artwork overflow is
        // visible outside the card, so the character appears in FRONT of the frame
        // rather than behind it.
        clipBehavior: Clip.antiAlias,
        child: Stack(
          // Clip.none on the Stack so the artwork can overflow the Stack's inner
          // content bounds into the card's 20 px padding zone before being clipped
          // by the outer Container's Clip.antiAlias boundary.  If this were
          // Clip.hardEdge the artwork would be cut at the Stack edge, 20 px short
          // of the card's actual outer edge, leaving a visible gap at the frame.
          clipBehavior: Clip.none,
          children: [
            // Artwork geometry: bottom: −55 positions the character's bottom
            // 55 px below the Stack edge = 35 px past the card's outer bottom edge.
            // end: −83 overshoots the card's end edge by 63 px.  height: 220 is the
            // owner-approved rendered size.
            //
            // With Container.clipBehavior Clip.antiAlias the overflow (35 px bottom,
            // 63 px end) is clipped to the card's rounded-rectangle shape, making
            // those portions invisible.  The foregroundDecoration border then paints
            // on top of the clipped artwork at the card's edges, creating the visual
            // of the character standing behind the card frame.
            //
            // Reverting to the old geometry (bottom: −18 / end: −14 / height: 116)
            // positions the artwork well inside the card; the character no longer
            // fills the card's corner and the border-behind effect disappears.
            PositionedDirectional(
              bottom: -55,
              end: -83,
              child: const CharacterArtwork(
                slot: VisualSlots.homeDelivery,
                height: 220,
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 96),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // [CRITICAL] (البوّابة ٥، 2026-10-10) ارتفاع البطاقة يتبع
                  // نصّها، والرسم 11 ونسخته العلوية مثبَّتان بأسفلها — نصٌّ
                  // كردي أطول كان يطيلها +٥٩ ويُنزل الشخصية ٩٨ عند ×١٫٣.
                  // العنوان سطرٌ يُصغَّر أولاً، والتوضيح فقرة: كلاهما يحجز ما
                  // تحتاجه أطول ترجماته، فالبطاقة — ومعها 11 — بارتفاعٍ واحد
                  // في كل لغة. الرسم ونسخته وموضعاهما كما هي.
                  BoundedText(
                    context.strings('deliveryAllGovernorates'),
                    maxLines: 3,
                    reserveFor: AppStrings.across('deliveryAllGovernorates'),
                    alignment: AlignmentDirectional.topStart,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontSize: 16,
                      fontWeight: AppDimens.weightExtraBold,
                    ),
                  ),
                  const SizedBox(height: AppDimens.space2),
                  BoundedText(
                    context.strings('deliveryCodWhatsapp'),
                    maxLines: 8,
                    minScale: 1,
                    reserveFor: AppStrings.across('deliveryCodWhatsapp'),
                    alignment: AlignmentDirectional.topStart,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontSize: 12.5,
                      height: 1.7,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
          // Same image, same height and same anchor as the artwork above, only
          // re-expressed against the card's OUTER box: the inner Stack is inset by
          // the card's 20 px padding, so bottom −55 → −35 and end −83 → −63.
          // Its bottom half is transparent (see CharacterArt.homeDeliveryOverlay).
          // Not clipped by the card and nothing is stacked after it.
          PositionedDirectional(
            bottom: -35,
            end: -63,
            child: IgnorePointer(
              child: Image.asset(
                CharacterArt.homeDeliveryOverlay,
                key: deliveryOverlayKey,
                height: 220,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const SizedBox(height: 220),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
