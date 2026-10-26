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

  /// عرضٌ يتّسع لأعرض هذه التسميات (بنمط الزرّ وحشوته وتكبير الخطّ) — لخانةٍ
  /// ثابتة لا يتغيّر عرضها بتغيّر اللغة فلا يتغيّر ما بجوارها. لا يقلّ عن
  /// أصغر عرضٍ للزرّ (٦٤).
  static double slotWidthFor(BuildContext context, Iterable<String> labels) {
    final style = DefaultTextStyle.of(context).style.merge(
      Theme.of(
        context,
      ).textTheme.labelLarge?.copyWith(fontWeight: AppDimens.weightSemiBold),
    );
    var widest = 0.0;
    for (final label in labels) {
      final painter = TextPainter(
        text: TextSpan(text: label, style: style),
        textScaler: MediaQuery.textScalerOf(context),
        textDirection: Directionality.of(context),
        maxLines: 1,
      )..layout();
      if (painter.width > widest) widest = painter.width;
      painter.dispose();
    }
    final width = widest + 2 * AppDimens.space3;
    return width < 64 ? 64 : width.ceilToDouble();
  }

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
