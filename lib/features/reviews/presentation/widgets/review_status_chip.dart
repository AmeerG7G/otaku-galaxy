import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/entities/review.dart';

/// شارة حالة التقييم: قيد المراجعة / منشور / مرفوض.
class ReviewStatusChip extends StatelessWidget {
  const ReviewStatusChip({super.key, required this.status});

  final ReviewStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (String label, Color color) = switch (status) {
      ReviewStatus.pending => ('⏳ تقييمك قيد المراجعة', colors.warning),
      ReviewStatus.approved => ('✓ تم نشر تقييمك', colors.success),
      ReviewStatus.rejected => ('❌ لم يتم قبول تقييمك', colors.error),
    };

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: AppDimens.space3,
        vertical: AppDimens.space1,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: AppDimens.weightBold,
        ),
      ),
    );
  }
}
