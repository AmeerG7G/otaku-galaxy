import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// حقل إدخال شاشات المصادقة بتصميم Otaku Galaxy v2.
///
/// يختلف عن [AnimeTextField] العام عمداً: المصدر يضع التسمية **فوق** الحقل
/// كنصّ صغير باهت، والحقل نفسه بلا أيقونات — سطح `surf2` بحافة ١٫٥ ونصف
/// قطر `r-s`. استخدام الحقل العام هنا كان يضع التسمية داخل الحقل ويضيف
/// أيقونات لا وجود لها في التصميم.
class AuthField extends StatelessWidget {
  const AuthField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.textDirection,
    this.onSubmitted,
    this.validator,
    this.trailing,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;

  /// أرقام الهاتف تُكتب من اليسار لليمين حتى داخل واجهة عربية.
  final TextDirection? textDirection;

  final ValueChanged<String>? onSubmitted;
  final FormFieldValidator<String>? validator;

  /// إجراء اختياري داخل الحقل (إظهار كلمة المرور مثلاً).
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
      borderSide: BorderSide(color: theme.colorScheme.outlineVariant, width: 1.5),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            fontSize: 12.5,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        TextFormField(
          controller: controller,
          obscureText: obscureText,
          keyboardType: keyboardType,
          textInputAction: textInputAction,
          textDirection: textDirection,
          onFieldSubmitted: onSubmitted,
          validator: validator,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 14.5,
            color: theme.colorScheme.onSurface,
          ),
          decoration: InputDecoration(
            hintText: hint,
            // النصّ النائب يتبع اتجاه الحقل: أرقام الهاتف تُعرض LTR وإلا
            // ظهرت مقلوبة («٤٥٦٧ ١٢٣ ٠٧٧٠»).
            hintTextDirection: textDirection,
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 14.5,
              color: theme.colorScheme.outline,
            ),
            filled: true,
            fillColor: theme.colorScheme.surfaceContainerHighest,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 15,
            ),
            suffixIcon: trailing,
            suffixIconConstraints: const BoxConstraints(
              minWidth: 44,
              minHeight: 44,
            ),
            border: border,
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: const BorderSide(
                color: AppColors.secondary,
                width: 1.5,
              ),
            ),
            errorBorder: border.copyWith(
              borderSide: BorderSide(
                color: context.themeColors.error,
                width: 1.5,
              ),
            ),
            focusedErrorBorder: border.copyWith(
              borderSide: BorderSide(
                color: context.themeColors.error,
                width: 1.5,
              ),
            ),
            errorStyle: theme.textTheme.labelSmall?.copyWith(
              fontSize: 11.5,
              color: context.themeColors.error,
            ),
          ),
        ),
      ],
    );
  }
}
