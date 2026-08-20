import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import 'button_enums.dart';

class AnimeTextButton extends StatelessWidget {
  const AnimeTextButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.iconPosition = IconPosition.start,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconPosition iconPosition;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: onPressed != null
            ? Theme.of(context).colorScheme.primary
            : AppColors.onSurfaceDisabled,
        padding: EdgeInsets.symmetric(
          horizontal: AppDimens.space3,
          vertical: AppDimens.space2,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        ),
        textStyle: Theme.of(
          context,
        ).textTheme.labelLarge?.copyWith(fontWeight: AppDimens.weightSemiBold),
      ),
      child: _buildContent(context),
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

/// بطاقة منتج بتصميم أنمي
