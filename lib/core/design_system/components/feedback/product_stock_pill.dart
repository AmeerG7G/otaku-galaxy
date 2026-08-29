import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// شارة حالة المخزون: متوفر / آخر قطع / نفدت.
///
/// كبسولة صغيرة بخلفية شفافة من لون الحالة نفسه — نمط v2 الموحّد.
class ProductStockPill extends StatelessWidget {
  const ProductStockPill({super.key, required this.stock, this.align = true});

  final int stock;

  /// محاذاة الكبسولة لبداية السطر داخل عمود ممتد.
  final bool align;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (String label, Color color) = switch (stock) {
      <= 0 => ('غير متوفر حالياً', colors.error),
      <= 3 => ('آخر $stock قطع', colors.warning),
      _ => ('متوفر', colors.success),
    };

    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 10,
          height: 1.3,
          fontWeight: AppDimens.weightBold,
          color: color,
        ),
      ),
    );

    return align
        ? Align(alignment: AlignmentDirectional.centerStart, child: pill)
        : pill;
  }
}
