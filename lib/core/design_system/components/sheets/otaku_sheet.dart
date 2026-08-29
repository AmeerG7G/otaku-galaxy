import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

/// الحاوية الأساسية لكل الأوراق السفلية في Otaku Galaxy v2.
///
/// التصميم لا يستخدم `AlertDialog` مطلقاً: كل تأكيد أو اختيار يظهر
/// كورقة سفلية بمقبض علوي ونصف قطر ٣٨ وحواف عليا مستديرة فقط.
class OtakuSheet extends StatelessWidget {
  const OtakuSheet({
    super.key,
    required this.child,
    this.title,
    this.titleSize = 16,
    this.padding = const EdgeInsets.fromLTRB(18, 14, 18, 26),
  });

  final Widget child;
  final String? title;
  final double titleSize;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppDimens.radiusXl),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.24),
            blurRadius: 40,
            offset: const Offset(0, -14),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: padding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // المقبض العلوي.
              Center(
                child: Container(
                  width: 40,
                  height: 5,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              if (title != null) ...[
                Text(
                  title!,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: titleSize,
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Flexible(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

/// يعرض ورقة سفلية بأسلوب v2 (ستارة داكنة + انزلاق ناعم).
Future<T?> showOtakuSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    isDismissible: isDismissible,
    enableDrag: isDismissible,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0xFF0C0718).withValues(alpha: 0.46),
    builder: builder,
  );
}

/// خيار داخل ورقة الاختيار.
class OtakuPickerOption<T> {
  const OtakuPickerOption({
    required this.value,
    required this.label,
    this.subtitle,
    this.enabled = true,
  });

  final T value;
  final String label;
  final String? subtitle;
  final bool enabled;
}

/// ورقة اختيار من قائمة — تحلّ محل `DropdownButton` و`SimpleDialog`.
///
/// الخيار المحدَّد يظهر بخلفية وردية شفافة وعلامة ✓ وردية.
Future<T?> showOtakuPicker<T>({
  required BuildContext context,
  required String title,
  required List<OtakuPickerOption<T>> options,
  T? selected,
  double maxHeight = 340,
}) {
  return showOtakuSheet<T>(
    context: context,
    builder: (sheetContext) {
      final theme = Theme.of(sheetContext);
      return OtakuSheet(
        title: title,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: options.length,
            itemBuilder: (context, index) {
              final option = options[index];
              final isSelected = option.value == selected;
              return InkWell(
                onTap: option.enabled
                    ? () => Navigator.of(sheetContext).pop(option.value)
                    : null,
                borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                child: Opacity(
                  opacity: option.enabled ? 1 : 0.4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.secondary.withValues(alpha: 0.10)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                option.label,
                                style: theme.textTheme.bodyLarge?.copyWith(
                                  fontSize: 14,
                                  fontWeight: isSelected
                                      ? AppDimens.weightBold
                                      : AppDimens.weightMedium,
                                  color: isSelected
                                      ? AppColors.secondary
                                      : theme.colorScheme.onSurface,
                                ),
                              ),
                              if (option.subtitle != null) ...[
                                const SizedBox(height: 3),
                                Text(
                                  option.subtitle!,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    fontSize: 11.5,
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        if (isSelected)
                          const Text(
                            '✓',
                            style: TextStyle(
                              color: AppColors.secondary,
                              fontWeight: AppDimens.weightExtraBold,
                              fontSize: 15,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      );
    },
  );
}

/// ورقة تأكيد — البديل الوحيد لـ`AlertDialog` في تصميم v2.
///
/// تُعيد `true` عند التأكيد و`false`/`null` عند الإلغاء.
Future<bool?> showOtakuConfirm({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  String? cancelLabel,
  bool destructive = false,
}) {
  return showOtakuSheet<bool>(
    context: context,
    builder: (sheetContext) {
      final theme = Theme.of(sheetContext);
      final confirmColor = destructive ? AppColors.error : AppColors.secondary;

      return OtakuSheet(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: theme.textTheme.titleLarge?.copyWith(
                fontFamily: 'Tajawal',
                fontWeight: AppDimens.weightBlack,
                fontSize: 19,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                height: 1.75,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: _SheetAction(
                    label:
                        cancelLabel ??
                        MaterialLocalizations.of(
                          sheetContext,
                        ).cancelButtonLabel,
                    onTap: () => Navigator.of(sheetContext).pop(false),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _SheetAction(
                    label: confirmLabel,
                    filled: true,
                    color: confirmColor,
                    onTap: () => Navigator.of(sheetContext).pop(true),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.label,
    required this.onTap,
    this.filled = false,
    this.color,
  });

  final String label;
  final VoidCallback onTap;
  final bool filled;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? color : theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: filled
              ? null
              : Border.all(color: theme.colorScheme.outlineVariant, width: 1.5),
          boxShadow: filled
              ? [
                  BoxShadow(
                    color: (color ?? AppColors.secondary).withValues(
                      alpha: 0.28,
                    ),
                    blurRadius: 26,
                    offset: const Offset(0, 12),
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: theme.textTheme.labelLarge?.copyWith(
            fontSize: 14.5,
            fontWeight: AppDimens.weightBold,
            color: filled ? Colors.white : theme.colorScheme.onSurface,
          ),
        ),
      ),
    );
  }
}

/// مفتاح تبديل بأسلوب v2 — كبسولة ٤٦×٢٧ وردية عند التفعيل.
class OtakuSwitch extends StatelessWidget {
  const OtakuSwitch({super.key, required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: AnimatedContainer(
        duration: AppDimens.durationFast,
        curve: AppDimens.curveEmphasized,
        width: 46,
        height: 27,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? AppColors.secondary : theme.colorScheme.outlineVariant,
          borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        ),
        child: AnimatedAlign(
          duration: AppDimens.durationFast,
          curve: AppDimens.curveEmphasized,
          alignment: value
              ? AlignmentDirectional.centerStart
              : AlignmentDirectional.centerEnd,
          child: Container(
            width: 21,
            height: 21,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
