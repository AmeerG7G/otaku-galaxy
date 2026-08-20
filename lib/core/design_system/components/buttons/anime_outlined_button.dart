import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import 'button_enums.dart';

class AnimeOutlinedButton extends StatelessWidget {
  const AnimeOutlinedButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.iconPosition = IconPosition.start,
    this.expanded = true,
    this.height,
    this.borderColor,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final IconPosition iconPosition;
  final bool expanded;
  final double? height;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final effectiveHeight = height ?? AppDimens.buttonHeightMd;
    final effectiveBorderColor =
        borderColor ?? Theme.of(context).colorScheme.primary;

    return SizedBox(
      width: expanded ? double.infinity : null,
      height: effectiveHeight,
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: onPressed != null
              ? effectiveBorderColor
              : AppColors.onSurfaceDisabled,
          side: BorderSide(
            color: onPressed != null
                ? effectiveBorderColor
                : AppColors.onSurfaceDisabled,
            width: 2,
          ),
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
                  valueColor: AlwaysStoppedAnimation<Color>(
                    effectiveBorderColor,
                  ),
                ),
              )
            : _buildContent(context),
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

/// زر نصي (Text Button) بتصميم أنمي
