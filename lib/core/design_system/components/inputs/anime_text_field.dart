import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

class AnimeTextField extends StatelessWidget {
  const AnimeTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.textAlign,
    this.onChanged,
    this.onSubmitted,
    this.onTap,
    this.validator,
    this.enabled = true,
    this.readOnly = false,
    this.maxLines = 1,
    this.initialValue,
    this.inputFormatters,
    this.maxLength,
    this.focusNode,
    this.prefixText,
    this.textDirection,
  });

  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextAlign? textAlign;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final VoidCallback? onTap;
  final FormFieldValidator<String>? validator;
  final bool enabled;
  final bool readOnly;
  final int maxLines;
  final String? initialValue;

  /// تسهيلات كتابة (حروف مسموحة، حدّ طول) — لا تحقّق.
  final List<TextInputFormatter>? inputFormatters;

  /// حدّ أقصى للطول بلا عدّاد مرئي — مرآةٌ لحدّ الخادم.
  final int? maxLength;

  final FocusNode? focusNode;

  /// نصٌّ ثابت داخل الحقل قبل ما يكتبه المستخدم (بادئة الهاتف `07`).
  final String? prefixText;

  /// اتجاه النصّ داخل الحقل — الأرقام تُكتب LTR ولو كانت الواجهة عربية.
  final TextDirection? textDirection;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      textDirection: textDirection,
      initialValue: initialValue,
      obscureText: obscureText,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      maxLength: maxLength,
      // بلا عدّاد «0/300» تحت الحقل: الحدّ يمنع لا يُعدّ.
      buildCounter: maxLength == null
          ? null
          : (_, {required currentLength, required isFocused, maxLength}) => null,
      textInputAction: textInputAction,
      textAlign: textAlign ?? TextAlign.start,
      onChanged: onChanged,
      onFieldSubmitted: onSubmitted,
      onTap: onTap,
      validator: validator,
      enabled: enabled,
      readOnly: readOnly,
      maxLines: maxLines,
      style: Theme.of(
        context,
      ).textTheme.bodyMedium?.copyWith(fontWeight: AppDimens.weightMedium),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        hintTextDirection: textDirection,
        prefixText: prefixText,
        prefixStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
          fontWeight: AppDimens.weightBold,
          color: Theme.of(context).colorScheme.onSurface,
        ),
        prefixIcon: prefixIcon != null
            ? Icon(prefixIcon, size: AppDimens.iconMd)
            : null,
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: Theme.of(context).colorScheme.surfaceContainerHighest,
        contentPadding: EdgeInsets.symmetric(
          horizontal: AppDimens.space5,
          vertical: AppDimens.space4,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.outline,
            width: AppDimens.cardBorderWidth,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.outline,
            width: AppDimens.cardBorderWidth,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary,
            width: 2,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(
            color: context.themeColors.error,
            width: AppDimens.cardBorderWidth,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(color: context.themeColors.error, width: 2),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppDimens.inputBorderRadius),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant,
            width: AppDimens.cardBorderWidth,
          ),
        ),
        labelStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontWeight: AppDimens.weightRegular,
        ),
        hintStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
          color: Theme.of(
            context,
          ).colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          fontWeight: AppDimens.weightRegular,
        ),
        errorStyle: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: context.themeColors.errorText,
          fontWeight: AppDimens.weightMedium,
        ),
        floatingLabelBehavior: FloatingLabelBehavior.auto,
        alignLabelWithHint: true,
      ),
    );
  }
}

/// شريحة اختيار (Chip) بتصميم أنمي
