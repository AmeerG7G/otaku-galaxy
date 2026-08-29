import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../products/domain/entities/banner.dart' as model;

class BannerCarousel extends StatefulWidget {
  const BannerCarousel({super.key, required this.banners});

  final List<model.Banner> banners;

  @override
  State<BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<BannerCarousel> {
  final _controller = PageController();
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    if (widget.banners.length > 1) {
      Future.doWhile(() async {
        await Future<void>.delayed(const Duration(seconds: 5));
        if (!mounted || !_controller.hasClients) return false;
        _currentPage = (_currentPage + 1) % widget.banners.length;
        _controller.animateToPage(
          _currentPage,
          duration: AppDimens.durationSlow,
          curve: AppDimens.curveStandard,
        );
        return true;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.banners.isEmpty) {
      return const SizedBox(height: AppDimens.bannerHeight);
    }

    return SizedBox(
      height: AppDimens.bannerHeight + AppDimens.space7,
      child: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.banners.length,
              onPageChanged: (index) => setState(() => _currentPage = index),
              itemBuilder: (context, index) => Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppDimens.screenHorizontalPadding,
                  vertical: AppDimens.space2,
                ),
                child: _PromoSlide(banner: widget.banners[index], index: index),
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              widget.banners.length,
              (index) => AnimatedContainer(
                duration: AppDimens.durationFast,
                margin: const EdgeInsets.symmetric(
                  horizontal: AppDimens.space1,
                ),
                width: _currentPage == index ? 22 : 6,
                height: 6,
                decoration: BoxDecoration(
                  gradient: _currentPage == index
                      ? context.themeColors.secondaryGradient
                      : null,
                  color: _currentPage == index
                      ? null
                      : Theme.of(context).colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// شريحة بانر واحدة.
///
/// كانت تبني من قائمة ترويج ثابتة داخل الملف وتتجاهل البانر القادم من
/// الخادم تماماً — لذلك لم تكن صور المسؤول تظهر ولا تتغيّر مهما رفع. الآن
/// تعرض صورة البانر الفعلية، ويبقى التصميم الترويجي القديم بديلاً حين لا
/// يرفع المسؤول صورة بعد.
class _PromoSlide extends StatelessWidget {
  const _PromoSlide({required this.banner, required this.index});

  final model.Banner banner;
  final int index;

  @override
  Widget build(BuildContext context) {
    final imageUrl = banner.imageUrl?.trim();
    if (imageUrl != null && imageUrl.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(AppDimens.bannerBorderRadius),
        child: Image.network(
          imageUrl,
          width: double.infinity,
          fit: BoxFit.cover,
          // فشل التحميل يعود للتصميم الترويجي بدل مستطيل مكسور.
          errorBuilder: (_, _, _) => _PromoFallback(index: index),
          loadingBuilder: (context, child, progress) => progress == null
              ? child
              : const OtakuSkeleton(height: AppDimens.bannerHeight),
        ),
      );
    }
    return _PromoFallback(index: index);
  }
}

/// التصميم الترويجي الافتراضي — يظهر فقط حين لا توجد صورة بانر.
class _PromoFallback extends StatelessWidget {
  const _PromoFallback({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    final promos = [
      ('وصل حديثاً', 'اختيارات أنمي تليق بمجموعتك', 'تسوّق الجديد'),
      ('عروض هذا الأسبوع', 'خصم مميز على منتجات مختارة', 'اكتشف العروض'),
      ('هديتك جاهزة', 'قطع صغيرة لمحبي الأنمي والمانغا', 'تصفح الهدايا'),
    ];
    final promo = promos[index % promos.length];
    final colors = context.themeColors;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: colors.bannerGradient,
        borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        boxShadow: [
          BoxShadow(
            color: colors.glowPrimary,
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        child: Stack(
          fit: StackFit.expand,
          children: [
            PositionedDirectional(
              top: -16,
              end: -8,
              child: Opacity(
                opacity: 0.24,
                child: OtakuStoreLogoSimple(size: 150),
              ),
            ),
            PositionedDirectional(
              bottom: -18,
              start: 24,
              child: Icon(
                Icons.auto_awesome,
                color: Colors.white.withValues(alpha: 0.18),
                size: 88,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppDimens.space6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    promo.$1,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: const Color(0xFFFFD98D),
                      fontWeight: AppDimens.weightBold,
                    ),
                  ),
                  const SizedBox(height: AppDimens.space1),
                  Text(
                    promo.$2,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: AppDimens.weightExtraBold,
                    ),
                  ),
                  const SizedBox(height: AppDimens.space2),
                  Text(
                    promo.$3,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.86),
                      fontWeight: AppDimens.weightBold,
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
