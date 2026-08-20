import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import 'button_enums.dart';

class AnimeSecondaryButton extends StatelessWidget {
  const AnimeSecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.iconPosition = IconPosition.start,
    this.expanded = true,
    this.height,
    this.gradient,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final IconPosition iconPosition;
  final bool expanded;
  final double? height;
  final LinearGradient? gradient;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final effectiveGradient = gradient ?? colors.secondaryGradient;
    final effectiveHeight = height ?? AppDimens.buttonHeightMd;

    return SizedBox(
      width: expanded ? double.infinity : null,
      height: effectiveHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed != null ? effectiveGradient : null,
          color: onPressed == null ? AppColors.onSurfaceDisabled : null,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          boxShadow: onPressed != null
              ? [
                  BoxShadow(
                    color: colors.glowSecondary,
                    blurRadius: 12,
                    spreadRadius: 1,
                    offset: const Offset(0, 3),
                  ),
                ]
              : null,
        ),
        child: ElevatedButton(
          onPressed: loading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            shadowColor: Colors.transparent,
            elevation: 0,
            padding: EdgeInsets.symmetric(horizontal: AppDimens.space6),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
            textStyle: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: AppDimens.weightSemiBold,
            ),
          ),
          child: loading
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : _buildContent(context),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    if (icon == null) return Text(label);

    final iconWidget = Icon(icon, size: AppDimens.iconSm);

    switch (iconPosition) {
      case IconPosition.start:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            SizedBox(width: AppDimens.space2),
            Text(label),
          ],
        );
      case IconPosition.end:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label),
            SizedBox(width: AppDimens.space2),
            iconWidget,
          ],
        );
      case IconPosition.only:
        return iconWidget;
    }
  }
}

/// زر مخطط (Outlined) بتصميم أنمي
