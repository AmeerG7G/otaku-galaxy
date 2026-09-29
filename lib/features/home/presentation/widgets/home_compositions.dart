import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../../../core/l10n/app_strings.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/character_artwork.dart';
import '../../../products/domain/entities/banner.dart' as model;

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
/// محصوراً داخل البطاقة ومثبَّتاً في زاويتها السفلية الطرفية (اليسرى في RTL).
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
  });

  /// فتحة الشخصية المضمَّنة — تُعرض حين لا صورة أو فشل تحميلها. `null`:
  /// لا شخصية احتياطية (البطاقة الترويجية الأولى منذ حذف الصورة 4).
  final String? slot;

  /// الارتفاع المطلوب — سقفٌ لا وعد: البطاقة الأقصر تُصغّره ولا تقصّه.
  final double height;

  /// نصف قطر زاوية البطاقة — يحدّد أصغر إزاحة آمنة.
  final double cornerRadius;
  final String? imageUrl;

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
      start: inset,
      end: inset,
      // `Align` يمرّر قيوداً فضفاضة: الارتفاع المطلوب يُقصر على المتاح،
      // والعرض المشتقّ من نسبة الصورة يُقصر على عرض البطاقة.
      child: Align(
        alignment: AlignmentDirectional.bottomEnd,
        child: imageUrl != null
            ? Image.network(
                imageUrl!,
                height: height,
                fit: BoxFit.contain,
                alignment: AlignmentDirectional.bottomEnd,
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

  @override
  Widget build(BuildContext context) {
    // نصّ البنر بلغة الواجهة الآن — الكردية الناقصة تسقط إلى العربية والعكس.
    final title = banner?.titleIn(context.language);
    final subtitle = banner?.subtitleIn(context.language);
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
      child: Container(
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
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 22, 22, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 190),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.26),
                        borderRadius: BorderRadius.circular(
                          AppDimens.radiusFull,
                        ),
                      ),
                      child: Text(
                        subtitle ?? context.strings('heroNewCollection'),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 10.5,
                          fontWeight: AppDimens.weightExtraBold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppDimens.space4),
                    Text(
                      title ?? context.strings('heroNewSeason'),
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontSize: 23,
                        height: 1.3,
                        fontWeight: AppDimens.weightBlack,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: AppDimens.space4),
                    GestureDetector(
                      onTap: onShop,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 19,
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
                          style: Theme.of(context).textTheme.labelMedium
                              ?.copyWith(
                                fontSize: 12.5,
                                fontWeight: AppDimens.weightExtraBold,
                                color: const Color(0xFF25123F),
                              ),
                        ),
                      ),
                    ),
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
      (_cardHeight - _cardVerticalPadding) *
          textScale.clamp(1.0, maxTextScale);

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
                  subtitle: context.strings.p('promoUpToDiscount', {'percent': '$maxDiscount'}),
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

/// شريط طمأنة التوصيل والدفع عند الاستلام.
class DeliveryAssuranceStrip extends StatelessWidget {
  const DeliveryAssuranceStrip({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 0),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            PositionedDirectional(
              bottom: -18,
              end: -14,
              child: const CharacterArtwork(
                slot: VisualSlots.homeDelivery,
                height: 116,
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 96),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    context.strings('deliveryAllGovernorates'),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontSize: 16,
                      fontWeight: AppDimens.weightExtraBold,
                    ),
                  ),
                  const SizedBox(height: AppDimens.space2),
                  Text(
                    context.strings('deliveryCodWhatsapp'),
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
    );
  }
}
