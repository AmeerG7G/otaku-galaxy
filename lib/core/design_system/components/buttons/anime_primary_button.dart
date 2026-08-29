import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import 'button_enums.dart';

class AnimePrimaryButton extends StatelessWidget {
  const AnimePrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.iconPosition = IconPosition.start,
    this.expanded = true,
    this.height,
    this.gradient,
    this.glowEnabled = true,
    this.borderRadius,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final IconPosition iconPosition;
  final bool expanded;
  final double? height;
  final LinearGradient? gradient;
  final bool glowEnabled;

  /// نصف قطر مخصّص. الافتراضي [AppDimens.radiusLg] كما هو في بقية الشاشات؛
  /// شاشات التصميم التي تطلب r-m (٢٢) تمرّره صراحةً.
  final double? borderRadius;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final effectiveGradient = gradient ?? colors.primaryGradient;
    final effectiveHeight = height ?? AppDimens.buttonHeightLg;
    final radius = borderRadius ?? AppDimens.radiusLg;

    return SizedBox(
      width: expanded ? double.infinity : null,
      height: effectiveHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed != null ? effectiveGradient : null,
          color: onPressed == null ? AppColors.onSurfaceDisabled : null,
          borderRadius: BorderRadius.circular(radius),
          boxShadow: glowEnabled && onPressed != null
              ? [
                  BoxShadow(
                    color: colors.glowPrimary,
                    blurRadius: 16,
                    spreadRadius: 2,
                    offset: const Offset(0, 4),
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
            padding: EdgeInsets.symmetric(horizontal: AppDimens.space7),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
            textStyle: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: AppDimens.weightBold,
              letterSpacing: AppDimens.letterSpacingWide,
            ),
          ),
          child: loading
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
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

    final iconWidget = Icon(icon, size: AppDimens.iconMd);

    switch (iconPosition) {
      case IconPosition.start:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            SizedBox(width: AppDimens.space3),
            Text(label),
          ],
        );
      case IconPosition.end:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label),
            SizedBox(width: AppDimens.space3),
            iconWidget,
          ],
        );
      case IconPosition.only:
        return iconWidget;
    }
  }
}
