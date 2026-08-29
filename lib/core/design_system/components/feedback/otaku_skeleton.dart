import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../layout/product_grid.dart';

/// مستطيل هيكلي متلألئ — لبنة حالات التحميل في Otaku Galaxy v2.
///
/// يعيد إنتاج `og-shimmer`: تدرّج أفقي يمرّ عبر لون فتحة الصورة
/// كل ١٫٢٥ ثانية بدل مؤشّر دائري في وسط الشاشة.
class OtakuSkeleton extends StatefulWidget {
  const OtakuSkeleton({
    super.key,
    this.width,
    this.height = 12,
    this.radius = 5,
    this.shape,
  });

  /// مربّع هيكلي بنصف قطر مخصّص (لفتحات الصور).
  const OtakuSkeleton.box({
    super.key,
    this.width = double.infinity,
    required this.height,
    this.radius = AppDimens.radiusSm,
  }) : shape = null;

  final double? width;
  final double height;
  final double radius;
  final BoxShape? shape;

  @override
  State<OtakuSkeleton> createState() => _OtakuSkeletonState();
}

class _OtakuSkeletonState extends State<OtakuSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1250),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final base = colors.photoSlot;
    final highlight = Theme.of(context).colorScheme.surfaceContainerHighest;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        // يمرّ اللمعان من النهاية إلى البداية عبر ثلاثة أضعاف العرض.
        final t = _controller.value;
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            shape: widget.shape ?? BoxShape.rectangle,
            borderRadius: widget.shape == BoxShape.circle
                ? null
                : BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(-1 - 2 * (1 - t), 0),
              end: Alignment(1 + 2 * t, 0),
              colors: [base, highlight, base],
              stops: const [0.25, 0.45, 0.65],
            ),
          ),
        );
      },
    );
  }
}

/// بطاقة منتج هيكلية — تطابق شبكة المنتجات أثناء التحميل.
class OtakuProductSkeletonCard extends StatelessWidget {
  const OtakuProductSkeletonCard({super.key, this.photoHeight = 130});

  final double photoHeight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OtakuSkeleton.box(height: photoHeight, radius: 0),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const FractionallySizedBox(
                  widthFactor: 0.84,
                  child: OtakuSkeleton(height: 9),
                ),
                const SizedBox(height: 9),
                const FractionallySizedBox(
                  widthFactor: 0.5,
                  child: OtakuSkeleton(height: 9),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// شبكة منتجات هيكلية بعمودين.
class OtakuProductSkeletonGrid extends StatelessWidget {
  const OtakuProductSkeletonGrid({
    super.key,
    this.count = 6,
    this.padding = const EdgeInsets.fromLTRB(18, 10, 18, 26),
  });

  final int count;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: padding,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      gridDelegate: kProductGridDelegate,
      itemCount: count,
      itemBuilder: (_, _) => const OtakuProductSkeletonCard(),
    );
  }
}

/// صفّ هيكلي للقوائم العمودية (الطلبات، الإشعارات، المراجعات).
class OtakuListSkeleton extends StatelessWidget {
  const OtakuListSkeleton({
    super.key,
    this.count = 4,
    this.height = 88,
    this.padding = const EdgeInsets.fromLTRB(18, 8, 18, 26),
  });

  final int count;
  final double height;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView.separated(
      padding: padding,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, _) => Container(
        height: height,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            FractionallySizedBox(
              widthFactor: 0.55,
              child: OtakuSkeleton(height: 10),
            ),
            SizedBox(height: 10),
            FractionallySizedBox(
              widthFactor: 0.8,
              child: OtakuSkeleton(height: 9),
            ),
          ],
        ),
      ),
    );
  }
}
