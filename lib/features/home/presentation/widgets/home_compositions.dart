import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/managed_artwork.dart';
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
                'عرض الكل',
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

/// بطاقة البطل في الرئيسية — تدرّج وردي→بنفسجي→أزرق مع رسم شخصية يخرج
/// من حدّ البطاقة. الرسم تزييني خلف المحتوى ولا يُستخدم كصورة منتج.
class HomeHeroCard extends StatelessWidget {
  const HomeHeroCard({super.key, required this.onShop, this.banner});

  final VoidCallback onShop;

  /// بنر البطل الذي يديره المسؤول. `null` يعني «لم يُضبط»، فيبقى التصميم
  /// المضمَّن كما هو — لا لوحة فارغة ولا نص نائب.
  final model.Banner? banner;

  @override
  Widget build(BuildContext context) {
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
            // صورة البنر التي يرفعها المسؤول تحلّ محلّ الشخصية المضمَّنة.
            // الموضع والمقاس لا يتغيّران — الصورة فقط.
            PositionedDirectional(
              bottom: -12,
              end: -34,
              child: SizedBox(
                height: 168,
                child: banner?.imageUrl != null
                    ? Image.network(
                        banner!.imageUrl!,
                        height: 168,
                        fit: BoxFit.contain,
                        // فشل تحميل صورة البنر يعود للشخصية المضمَّنة بدل
                        // ترك فجوة في أبرز لوحة على الشاشة.
                        errorBuilder: (_, _, _) => const ManagedArtwork(
                          slot: VisualSlots.homeHero,
                          fallbackAsset: 'assets/art/opt/a-i5.png',
                          height: 168,
                        ),
                      )
                    : const ManagedArtwork(
                        slot: VisualSlots.homeHero,
                        fallbackAsset: 'assets/art/opt/a-i5.png',
                        height: 168,
                      ),
              ),
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
                        (banner?.subtitle.trim().isNotEmpty ?? false)
                            ? banner!.subtitle.trim()
                            : 'تشكيلة جديدة',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 10.5,
                          fontWeight: AppDimens.weightExtraBold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppDimens.space4),
                    Text(
                      (banner?.title?.trim().isNotEmpty ?? false)
                          ? banner!.title!.trim()
                          : 'موسم جديد من\nعالم الأنمي',
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
                          'تسوّق الآن',
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
/// حين لا يضبط شيئاً تبقى البطاقتان المضمَّنتان كما كانتا — الشاشة لا تفرغ
/// لأن أحداً لم يفتح اللوحة بعد.
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
  static const List<List<Color>> _palettes = [
    [Color(0xFF4EA8FF), Color(0xFF7C5CFF)],
    [Color(0xFFFFB02E), Color(0xFFFF3D8F)],
    [Color(0xFF22B07D), Color(0xFF4EA8FF)],
    [Color(0xFFFF9A5A), Color(0xFFFF3D8F)],
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
      (_cardHeight - _cardVerticalPadding) * textScale.clamp(1.0, 1.6);

  @override
  Widget build(BuildContext context) {
    final managed = banners;
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
                    title: banner.title?.trim().isNotEmpty == true
                        ? banner.title!.trim()
                        : 'عرض',
                    subtitle: banner.subtitle,
                    slot: index == 0
                        ? VisualSlots.homePromoPrimary
                        : VisualSlots.homePromoSecondary,
                    art: index == 0
                        ? 'assets/art/opt/a-i0.png'
                        : 'assets/art/opt/a-i6.png',
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
                  title: 'موسم المدرسة',
                  subtitle: 'دفاتر وأقلام',
                  slot: VisualSlots.homePromoPrimary,
                  art: 'assets/art/opt/a-i0.png',
                  height: cardHeight,
                  colors: _palettes[0],
                  onTap: onTap,
                ),
                if (maxDiscount != null) ...[
                  const SizedBox(width: AppDimens.space4),
                  _PromoCard(
                    title: 'خصومات فعّالة',
                    subtitle: 'حتى $maxDiscount٪',
                    slot: VisualSlots.homePromoSecondary,
                    art: 'assets/art/opt/a-i6.png',
                    height: cardHeight,
                    colors: _palettes[1],
                    onTap: onTap,
                  ),
                ],
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
    required this.art,
    this.imageUrl,
    required this.colors,
    required this.onTap,
    required this.height,
  });

  /// ارتفاع البطاقة — يحسبه الصفّ مرة واحدة من مقياس الخط.
  final double height;

  final String title;
  final String subtitle;

  /// فتحة هذه البطاقة بعينها — البطاقتان تُدارتان مستقلتين من اللوحة.
  final String slot;

  final String art;

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
            PositionedDirectional(
              bottom: -8,
              end: -18,
              child: SizedBox(
                height: 110,
                child: imageUrl != null
                    ? Image.network(
                        imageUrl!,
                        height: 110,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => ManagedArtwork(
                          slot: slot,
                          fallbackAsset: art,
                          height: 110,
                        ),
                      )
                    : ManagedArtwork(
                        slot: slot,
                        fallbackAsset: art,
                        height: 110,
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 76, 16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontSize: 16,
                      fontWeight: AppDimens.weightBlack,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11.5,
                      color: Colors.white.withValues(alpha: 0.88),
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
              child: const ManagedArtwork(
                slot: VisualSlots.homeDelivery,
                fallbackAsset: 'assets/art/opt/a-i3.png',
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
                    'توصيل لكل المحافظات',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontSize: 16,
                      fontWeight: AppDimens.weightExtraBold,
                    ),
                  ),
                  const SizedBox(height: AppDimens.space2),
                  Text(
                    'الدفع عند الاستلام، وتأكيد الطلب عبر واتساب قبل الإرسال.',
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
