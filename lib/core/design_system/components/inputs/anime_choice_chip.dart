import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

/// رقاقة اختيار بتصميم Otaku Galaxy v2.
///
/// عند التحديد: كبسولة متدرّجة وردي→بنفسجي بحبر أبيض بلا حافة.
/// عند غيره: سطح عائم بحافة رفيعة وحبر ثانوي — لا `FilterChip` مادية.
class AnimeChoiceChip extends StatelessWidget {
  const AnimeChoiceChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onSelected,
    this.icon,
    this.color,
  });

  final String label;
  final bool selected;
  final ValueChanged<bool> onSelected;
  final IconData? icon;

  /// لون بديل للتدرّج عند الحاجة (فلاتر الحالة مثلاً).
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = color;

    return InkWell(
      onTap: () => onSelected(!selected),
      borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      child: AnimatedContainer(
        duration: AppDimens.durationFast,
        curve: AppDimens.curveEmphasized,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          gradient: selected && tint == null ? AppColors.primaryGradient : null,
          // لون صلب تحت التدرّج بدل `transparent`: لو تعذّر رسم التدرّج لأي
          // سبب تبقى الرقاقة المحدَّدة مصمتة وواضحة بدل أن تبدو شفافة.
          color: selected
              ? (tint ?? AppColors.secondary)
              : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusFull),
          border: selected
              ? null
              : Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 14,
                color: selected
                    ? Colors.white
                    : theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: theme.textTheme.labelLarge?.copyWith(
                fontSize: 13,
                height: 1.2,
                fontWeight: selected
                    ? AppDimens.weightBold
                    : AppDimens.weightSemiBold,
                color: selected
                    ? Colors.white
                    : theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
