import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../typography/bounded_text.dart';
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
    this.horizontalPadding = AppDimens.space7,
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

  /// حشوة التسمية الأفقية. الافتراضي ٢٤؛ صفٌّ ضيّق (زرٌّ بجوار المجموع في
  /// شريطٍ سفلي) يمرّر أقلّ ليتّسع لتسميته. التسمية موسَّطة، فتسميةٌ تتّسع لا
  /// يتغيّر موضعها بتغيّر الحشوة.
  final double horizontalPadding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final effectiveGradient = gradient ?? colors.primaryGradient;
    final effectiveHeight = height ?? AppDimens.buttonHeightLg;
    final radius = borderRadius ?? AppDimens.radiusLg;

    // المعطَّل بألوان المظهر (Material 3: حاوية `onSurface` ١٢٪ وحبر ٣٨٪) لا
    // بلونٍ ثابت واحد للمظهرين — كان `AppColors.onSurfaceDisabled` بنفسجياً
    // رمادياً في الداكن والفاتح معاً فلا ينتمي لأيّهما.
    final scheme = Theme.of(context).colorScheme;
    final disabledFill = scheme.onSurface.withValues(alpha: 0.12);
    final disabledInk = scheme.onSurface.withValues(alpha: 0.38);

    return SizedBox(
      width: expanded ? double.infinity : null,
      height: effectiveHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: onPressed != null ? effectiveGradient : null,
          color: onPressed == null ? disabledFill : null,
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
            disabledBackgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            disabledForegroundColor: disabledInk,
            shadowColor: Colors.transparent,
            elevation: 0,
            padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
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
    // [CRITICAL] التسمية سطرٌ واحد في منطقةٍ محدودة (`BoundedText`): أطول من
    // الزرّ تُصغَّر بدل أن تلتفّ أو تتجاوز (كان الزرّ يتجاوز ٦٢ بكسل بالكردية
    // على ٣٢٠×١٫٣). الحدّ ٠٫٨ من مقاس التصميم ([PRODUCT] 2026-10-05): عند
    // ×١٫٣ نحو ٠٫٦٢ من المكبَّر. تسميةٌ تتّسع لا تتغيّر.
    final text = BoundedText(label, floorAtDesignSize: true);
    if (icon == null) return text;

    final iconWidget = Icon(icon, size: AppDimens.iconMd);

    switch (iconPosition) {
      case IconPosition.start:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            SizedBox(width: AppDimens.space3),
            Flexible(child: text),
          ],
        );
      case IconPosition.end:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: text),
            SizedBox(width: AppDimens.space3),
            iconWidget,
          ],
        );
      case IconPosition.only:
        return iconWidget;
    }
  }
}
