import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../typography/bounded_text.dart';
import 'button_enums.dart';

class AnimeTextButton extends StatelessWidget {
  const AnimeTextButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.iconPosition = IconPosition.start,
    this.fallbackIcon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconPosition iconPosition;

  /// أيقونةٌ تحلّ محلّ التسمية حين لا تتّسع لها المساحة حتى عند الحدّ الأدنى
  /// (والتسمية تبقى تلميحاً ووصفاً لقارئ الشاشة). بلا أيقونة: تُصغَّر التسمية
  /// كالمعتاد ويُبلَّغ ما لا يتّسع.
  final IconData? fallbackIcon;

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
    // [CRITICAL] التسمية سطرٌ واحد في منطقةٍ محدودة (`BoundedText`): أطول من
    // المساحة التي يُعطاها الزرّ تُصغَّر بدل أن تلتفّ فتُطيل ما حولها (إجراء
    // ترويسة الإشعارات). الحدّ ٠٫٨ من مقاس التصميم ([PRODUCT] 2026-10-05).
    // تسميةٌ تتّسع لا تتغيّر.
    final text = BoundedText(
      label,
      floorAtDesignSize: true,
      whenUnfit: fallbackIcon == null
          ? null
          : Tooltip(
              message: label,
              child: Icon(fallbackIcon, size: AppDimens.iconMd, semanticLabel: label),
            ),
    );
    if (icon == null) return text;

    final iconWidget = Icon(icon, size: AppDimens.iconSm);

    switch (iconPosition) {
      case IconPosition.start:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            SizedBox(width: AppDimens.space2),
            Flexible(child: text),
          ],
        );
      case IconPosition.end:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: text),
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
