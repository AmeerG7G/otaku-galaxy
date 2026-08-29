import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

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
  const HomeHeroCard({super.key, required this.onShop});

  final VoidCallback onShop;

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
            // الشخصية تخرج من الحافة السفلية جهة النهاية.
            PositionedDirectional(
              bottom: -12,
              end: -34,
              child: Image.asset(
                'assets/art/opt/a-i5.png',
                height: 168,
                fit: BoxFit.contain,
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
                        'تشكيلة جديدة',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 10.5,
                          fontWeight: AppDimens.weightExtraBold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppDimens.space4),
                    Text(
                      'موسم جديد من\nعالم الأنمي',
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

/// شريط بطاقتين ترويجيتين أفقيتين تحت البطل.
class HomePromoRail extends StatelessWidget {
  const HomePromoRail({super.key, required this.onTap, this.maxDiscount});

  final VoidCallback onTap;

  /// أعلى نسبة خصم حقيقية في الكتالوج. `null` يعني لا خصومات فعلية الآن،
  /// فلا نعرض بطاقة الخصومات إطلاقاً بدل ادّعاء نسبة غير موجودة.
  final int? maxDiscount;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 112,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
        children: [
          _PromoCard(
            title: 'موسم المدرسة',
            subtitle: 'دفاتر وأقلام',
            art: 'assets/art/opt/a-i0.png',
            colors: const [Color(0xFF4EA8FF), Color(0xFF7C5CFF)],
            onTap: onTap,
          ),
          if (maxDiscount != null) ...[
            const SizedBox(width: AppDimens.space4),
            _PromoCard(
              title: 'خصومات فعّالة',
              subtitle: 'حتى $maxDiscount٪',
              art: 'assets/art/opt/a-i6.png',
              colors: const [Color(0xFFFFB02E), Color(0xFFFF3D8F)],
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
    required this.art,
    required this.colors,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final String art;
  final List<Color> colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 196,
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
              child: Image.asset(art, height: 110, fit: BoxFit.contain),
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
              child: Image.asset(
                'assets/art/opt/a-i3.png',
                height: 116,
                fit: BoxFit.contain,
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
