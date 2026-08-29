import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// عنوان قسم داخل الشاشة — Tajawal ثقيل بحجم ١٧.
class OtakuSectionTitle extends StatelessWidget {
  const OtakuSectionTitle({
    super.key,
    required this.title,
    this.action,
    this.padding = const EdgeInsets.fromLTRB(18, 26, 18, 12),
  });

  final String title;

  /// إجراء نصي في نهاية السطر (عرض الكل مثلاً).
  final Widget? action;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontFamily: 'Tajawal',
                fontWeight: AppDimens.weightExtraBold,
                fontSize: 17,
                height: 1.3,
              ),
            ),
          ),
          ?action,
        ],
      ),
    );
  }
}

/// سطح عائم أساسي — بطاقة بيضاء بحافة رفيعة وظلّ خفيف.
class OtakuPanel extends StatelessWidget {
  const OtakuPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.onTap,
    this.radius = AppDimens.radiusMd,
    this.elevated = true,
    this.borderColor,
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final double radius;
  final bool elevated;
  final Color? borderColor;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    final panel = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: borderColor ?? theme.colorScheme.outlineVariant,
        ),
        boxShadow: elevated ? colors.shadowXSoft : null,
      ),
      child: child,
    );

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: onTap == null
          ? panel
          : InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(radius),
              child: panel,
            ),
    );
  }
}

/// لوحة تحريرية — خلفية ثانوية مستديرة مع رسم شخصية يخرج من الحافة.
///
/// هذا هو نمط v2 للأقسام الترويجية والحالات الفارغة داخل الصفحات.
class OtakuEditorialPanel extends StatelessWidget {
  const OtakuEditorialPanel({
    super.key,
    required this.title,
    this.body,
    this.artwork,
    this.action,
    this.margin = const EdgeInsets.fromLTRB(18, 26, 18, 0),
    this.contentWidthFactor = 0.62,
    this.artHeight = 104,
    this.minHeight = 0,
  });

  final String title;
  final String? body;
  final String? artwork;
  final Widget? action;
  final EdgeInsetsGeometry margin;

  /// نسبة عرض النص حتى لا يتداخل مع الرسم.
  final double contentWidthFactor;
  final double artHeight;
  final double minHeight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: margin,
      child: Container(
        constraints: BoxConstraints(minHeight: minHeight),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            if (artwork != null)
              PositionedDirectional(
                bottom: -12,
                end: -10,
                child: IgnorePointer(
                  child: Image.asset(artwork!, height: artHeight),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: FractionallySizedBox(
                  widthFactor: artwork == null ? 1.0 : contentWidthFactor,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontFamily: 'Tajawal',
                          fontWeight: AppDimens.weightExtraBold,
                          fontSize: 15.5,
                          height: 1.5,
                        ),
                      ),
                      if (body != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          body!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 12,
                            height: 1.7,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                      if (action != null) ...[
                        const SizedBox(height: 14),
                        action!,
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// كبسولة حالة — نقطة ملوّنة ونص على خلفية شفافة من اللون نفسه.
class OtakuStatusPill extends StatelessWidget {
  const OtakuStatusPill({
    super.key,
    required this.label,
    required this.color,
    this.showDot = true,
    this.fontSize = 10.5,
  });

  final String label;
  final Color color;
  final bool showDot;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontSize: fontSize,
              height: 1.2,
              fontWeight: AppDimens.weightBold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// شريط إجراءات سفلي ثابت — يتلاشى فوقه لون الخلفية بدل خطّ فاصل.
class OtakuBottomActionBar extends StatelessWidget {
  const OtakuBottomActionBar({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(18, 14, 18, 18),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final background = Theme.of(context).scaffoldBackgroundColor;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [background, background, background.withValues(alpha: 0)],
          stops: const [0, 0.62, 1],
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// زرّ الفرز/الترتيب أعلى شبكات المنتجات.
class OtakuSortBar extends StatelessWidget {
  const OtakuSortBar({
    super.key,
    required this.label,
    required this.onTap,
    this.trailing,
  });

  final String label;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          border: Border.all(
            color: theme.colorScheme.outlineVariant,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.sort_rounded,
              size: 16,
              color: theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: theme.textTheme.labelLarge?.copyWith(
                fontSize: 13.5,
                fontWeight: AppDimens.weightBold,
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      ),
    );
  }
}

/// عنوان مجموعة صغير متباعد الأحرف — يفصل أقسام الإعدادات والقوائم.
class OtakuGroupLabel extends StatelessWidget {
  const OtakuGroupLabel({
    super.key,
    required this.label,
    this.padding = const EdgeInsets.fromLTRB(0, 6, 0, 11),
  });

  final String label;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: padding,
      child: Text(
        label,
        style: theme.textTheme.labelSmall?.copyWith(
          fontSize: 11.5,
          fontWeight: AppDimens.weightBold,
          letterSpacing: 0.7,
          color: theme.colorScheme.outline,
        ),
      ),
    );
  }
}

/// صفّ إعداد — أيقونة مربّعة ملوّنة، عنوان، قيمة اختيارية، ثم سهم.
///
/// هذا هو بديل `ListTile` في تصميم v2: سطح عائم مستقل بحافة ونصف قطر ٢٢.
class OtakuSettingRow extends StatelessWidget {
  const OtakuSettingRow({
    super.key,
    required this.label,
    this.icon,
    this.iconColor,
    this.value,
    this.onTap,
    this.trailing,
    this.showChevron = true,
    this.labelColor,
    this.compact = false,
  });

  final String label;
  final IconData? icon;
  final Color? iconColor;

  /// نص قيمة مختصر قبل السهم (اسم الثيم مثلاً).
  final String? value;
  final VoidCallback? onTap;

  /// عنصر بديل للسهم (مفتاح تبديل مثلاً).
  final Widget? trailing;
  final bool showChevron;
  final Color? labelColor;

  /// صفّ أقصر يُستخدم لصفوف التبديل.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = iconColor ?? theme.colorScheme.primary;
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return OtakuPanel(
      onTap: onTap,
      padding: EdgeInsets.symmetric(
        horizontal: 16,
        vertical: compact ? 13 : 15,
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 17, color: tint),
            ),
            const SizedBox(width: 13),
          ],
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: compact ? 13.5 : 14,
                fontWeight: AppDimens.weightSemiBold,
                color: labelColor,
              ),
            ),
          ),
          if (value != null) ...[
            const SizedBox(width: 8),
            Text(
              value!,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 11.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          if (trailing == null && showChevron && onTap != null) ...[
            const SizedBox(width: 10),
            Icon(
              isRtl
                  ? Icons.arrow_forward_ios_rounded
                  : Icons.arrow_back_ios_new_rounded,
              size: 13,
              color: theme.colorScheme.outline,
            ),
          ],
        ],
      ),
    );
  }
}

/// مبدّل مقسّم بأسلوب v2 — حاوية ثانوية مستديرة والمقطع النشط سطح أبيض.
///
/// يحلّ محل `TabBar` المادي في التبويبات الداخلية القصيرة.
class OtakuSegmentedControl extends StatelessWidget {
  const OtakuSegmentedControl({
    super.key,
    required this.labels,
    required this.selectedIndex,
    required this.onSelected,
    this.margin = const EdgeInsets.fromLTRB(18, 12, 18, 0),
  });

  final List<String> labels;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Padding(
      padding: margin,
      child: Container(
        padding: const EdgeInsets.all(5),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          children: [
            for (var i = 0; i < labels.length; i++) ...[
              if (i > 0) const SizedBox(width: 5),
              Expanded(
                child: InkWell(
                  onTap: () => onSelected(i),
                  borderRadius: BorderRadius.circular(14),
                  child: AnimatedContainer(
                    duration: AppDimens.durationFast,
                    curve: AppDimens.curveEmphasized,
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == selectedIndex
                          ? theme.colorScheme.surface
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: i == selectedIndex ? colors.shadowXSoft : null,
                    ),
                    child: Text(
                      labels[i],
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontSize: 13,
                        fontWeight: i == selectedIndex
                            ? AppDimens.weightBold
                            : AppDimens.weightSemiBold,
                        color: i == selectedIndex
                            ? AppColors.secondary
                            : theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
