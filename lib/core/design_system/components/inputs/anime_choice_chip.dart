import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

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
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? Theme.of(context).colorScheme.primary;
    final themeColors = context.themeColors;

    return FilterChip(
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: AppDimens.iconXs),
            SizedBox(width: AppDimens.space1),
          ],
          Text(label),
        ],
      ),
      selected: selected,
      onSelected: onSelected,
      showCheckmark: false,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      selectedColor: effectiveColor.withValues(alpha: 0.15),
      checkmarkColor: effectiveColor,
      side: BorderSide(
        color: selected
            ? effectiveColor
            : Theme.of(context).colorScheme.outlineVariant,
        width: selected ? 2 : 1,
      ),
      labelStyle: Theme.of(context).textTheme.labelMedium?.copyWith(
        color: selected
            ? effectiveColor
            : Theme.of(context).colorScheme.onSurfaceVariant,
        fontWeight: selected ? AppDimens.weightBold : AppDimens.weightMedium,
      ),
      padding: EdgeInsets.symmetric(
        horizontal: AppDimens.space3,
        vertical: AppDimens.space1,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      elevation: 0,
      pressElevation: 0,
      selectedShadowColor: themeColors.glowPrimary,
      shadowColor: Colors.transparent,
    );
  }
}

/// مؤشر تحميل بتصميم أنمي
