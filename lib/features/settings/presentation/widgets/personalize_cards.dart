import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// علامة اختيار دائرية — وردية ممتلئة عند التحديد وفارغة بحافة عند غيره.
class OtakuTick extends StatelessWidget {
  const OtakuTick({super.key, required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? AppColors.secondary : Colors.transparent,
        border: Border.all(
          color: active
              ? AppColors.secondary
              : Theme.of(context).colorScheme.outlineVariant,
          width: 1.5,
        ),
      ),
      child: active
          ? const Icon(Icons.check_rounded, size: 12, color: Colors.white)
          : null,
    );
  }
}

/// بطاقة اختيار لغة — اسم اللغة بخطها الأصلي مع وصف قصير وعلامة اختيار.
class LanguageCard extends StatelessWidget {
  const LanguageCard({
    super.key,
    required this.name,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final String name;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: Border.all(
            color: selected
                ? AppColors.secondary
                : theme.colorScheme.outlineVariant,
            width: 1.5,
          ),
          boxShadow: colors.shadowXSoft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontFamily: 'Tajawal',
                      fontWeight: AppDimens.weightExtraBold,
                      fontSize: 16,
                    ),
                  ),
                ),
                OtakuTick(active: selected),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 11.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// بطاقة معاينة مظهر — نموذج مصغّر للتطبيق بألوان الوضع المعروض.
///
/// هذه هي طريقة v2 لاختيار الثيم: المستخدم يرى شكل التطبيق فعلياً بدل
/// صفّ راديو بأيقونة شمس أو قمر.
class ThemePreviewCard extends StatelessWidget {
  const ThemePreviewCard({
    super.key,
    required this.dark,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final bool dark;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    // ألوان المعاينة ثابتة — تمثّل الوضع المعروض لا الوضع الحالي.
    final canvas = dark ? const Color(0xFF0B0716) : const Color(0xFFF7F5FC);
    final surface = dark ? const Color(0xFF191131) : Colors.white;
    final slot = dark ? const Color(0xFF221A3D) : const Color(0xFFEFEAFA);
    final ink = dark
        ? Colors.white.withValues(alpha: 0.20)
        : const Color(0xFF1C103A).withValues(alpha: 0.16);
    final hairline = dark
        ? Colors.white.withValues(alpha: 0.10)
        : const Color(0xFF1C103A).withValues(alpha: 0.09);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(
            color: selected
                ? AppColors.secondary
                : theme.colorScheme.outlineVariant,
            width: 1.5,
          ),
          boxShadow: selected ? colors.shadowFloating : colors.shadowXSoft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // النموذج المصغّر.
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: canvas,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: hairline),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // شريط علوي مصغّر.
                  Row(
                    children: [
                      Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          gradient: AppColors.primaryGradient,
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 46,
                        height: 6,
                        decoration: BoxDecoration(
                          color: ink,
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 9),
                  // بطاقة منتج مصغّرة بفتحة صورة.
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          height: 40,
                          decoration: BoxDecoration(
                            color: slot,
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(color: hairline),
                          ),
                        ),
                        const SizedBox(height: 7),
                        FractionallySizedBox(
                          widthFactor: 0.74,
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: ink,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                        const SizedBox(height: 5),
                        FractionallySizedBox(
                          widthFactor: 0.4,
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: AppColors.secondary,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  // شريط تنقل سفلي مصغّر.
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: surface,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (var i = 0; i < 4; i++)
                          Container(
                            width: 9,
                            height: 9,
                            decoration: BoxDecoration(
                              color: i == 0 ? AppColors.secondary : ink,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13.5,
                      fontWeight: AppDimens.weightBold,
                    ),
                  ),
                ),
                OtakuTick(active: selected),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
