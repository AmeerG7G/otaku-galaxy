import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

class AnimeLinearProgress extends StatelessWidget {
  const AnimeLinearProgress({
    super.key,
    this.value,
    this.height = 4,
    this.backgroundColor,
    this.valueColor,
    this.borderRadius,
  });

  final double? value;
  final double height;
  final Color? backgroundColor;
  final Color? valueColor;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return LinearProgressIndicator(
      value: value,
      minHeight: height,
      backgroundColor:
          backgroundColor ??
          colors.primaryGradient.colors.first.withValues(alpha: 0.1),
      valueColor: AlwaysStoppedAnimation<Color>(
        valueColor ?? colors.primaryGradient.colors.first,
      ),
      borderRadius: borderRadius ?? BorderRadius.circular(AppDimens.radiusFull),
    );
  }
}

/// حالة فارغة بتصميم أنمي
