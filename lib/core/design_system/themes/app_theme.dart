import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_dimens.dart';
import '../tokens/app_theme_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colors = isLight
        ? AppColors.lightColorScheme
        : AppColors.darkColorScheme;
    final brand = isLight ? AppThemeColors.light : AppThemeColors.dark;
    final text = _textTheme(colors);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colors,
      scaffoldBackgroundColor: isLight ? AppColors.background : colors.surface,
      textTheme: text,
      extensions: [brand],
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: colors.onSurface,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: text.titleLarge,
        iconTheme: IconThemeData(
          color: colors.onSurface,
          size: AppDimens.iconLg,
        ),
        actionsIconTheme: IconThemeData(
          color: colors.onSurface,
          size: AppDimens.iconLg,
        ),
      ),
      cardTheme: CardThemeData(
        color: colors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shadowColor: brand.shadowLight,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusXl),
          side: BorderSide(color: colors.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isLight ? AppColors.surface : colors.surfaceContainerHighest,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppDimens.space5,
          vertical: AppDimens.space4,
        ),
        prefixIconColor: colors.onSurfaceVariant,
        suffixIconColor: colors.onSurfaceVariant,
        hintStyle: text.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
        labelStyle: text.bodyMedium?.copyWith(color: colors.onSurfaceVariant),
        errorStyle: text.bodySmall?.copyWith(color: colors.error),
        border: _inputBorder(colors.outline),
        enabledBorder: _inputBorder(colors.outlineVariant),
        focusedBorder: _inputBorder(colors.primary, width: 2),
        errorBorder: _inputBorder(colors.error),
        focusedErrorBorder: _inputBorder(colors.error, width: 2),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(
            AppDimens.buttonMinWidth,
            AppDimens.buttonHeightLg,
          ),
          elevation: 0,
          foregroundColor: Colors.white,
          backgroundColor: colors.primary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          textStyle: text.labelLarge?.copyWith(
            fontWeight: AppDimens.weightBold,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(
            AppDimens.buttonMinWidth,
            AppDimens.buttonHeightLg,
          ),
          backgroundColor: colors.primary,
          foregroundColor: colors.onPrimary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          textStyle: text.labelLarge?.copyWith(
            fontWeight: AppDimens.weightBold,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(
            AppDimens.buttonMinWidth,
            AppDimens.buttonHeightMd,
          ),
          foregroundColor: colors.primary,
          side: BorderSide(color: colors.outline),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          textStyle: text.labelLarge?.copyWith(
            fontWeight: AppDimens.weightSemiBold,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.primary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          ),
          textStyle: text.labelLarge?.copyWith(
            fontWeight: AppDimens.weightSemiBold,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: colors.onSurface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: AppDimens.bottomNavHeight,
        elevation: 0,
        backgroundColor: isLight ? colors.surface : const Color(0xFF1A152C),
        surfaceTintColor: Colors.transparent,
        indicatorColor: isLight
            ? colors.primaryContainer
            : colors.primaryContainer,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return text.labelSmall?.copyWith(
            color: selected
                ? colors.onPrimaryContainer
                : colors.onSurfaceVariant,
            fontWeight: selected
                ? AppDimens.weightBold
                : AppDimens.weightMedium,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            size: AppDimens.bottomNavIconSize,
            color: selected
                ? colors.onPrimaryContainer
                : colors.onSurfaceVariant,
          );
        }),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.primary,
        unselectedLabelColor: colors.onSurfaceVariant,
        labelStyle: text.labelLarge?.copyWith(fontWeight: AppDimens.weightBold),
        unselectedLabelStyle: text.labelLarge,
        dividerColor: Colors.transparent,
        indicatorSize: TabBarIndicatorSize.label,
      ),
      dividerTheme: DividerThemeData(
        color: colors.outlineVariant,
        thickness: 1,
        space: AppDimens.space5,
      ),
      listTileTheme: ListTileThemeData(
        iconColor: colors.onSurfaceVariant,
        textColor: colors.onSurface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppDimens.space5,
          vertical: AppDimens.space2,
        ),
        titleTextStyle: text.titleSmall?.copyWith(
          fontWeight: AppDimens.weightSemiBold,
        ),
        subtitleTextStyle: text.bodySmall?.copyWith(
          color: colors.onSurfaceVariant,
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.primary
              : colors.outline,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? colors.primaryContainer
              : colors.surfaceContainerHighest,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: colors.inverseSurface,
        contentTextStyle: text.bodyMedium?.copyWith(
          color: colors.onInverseSurface,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius2xl),
          side: BorderSide(color: colors.outlineVariant),
        ),
        titleTextStyle: text.titleLarge,
        contentTextStyle: text.bodyMedium,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppDimens.radius2xl),
          ),
          side: BorderSide(color: colors.outlineVariant),
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colors.primary,
        linearTrackColor: colors.primaryContainer,
      ),
    );
  }

  static OutlineInputBorder _inputBorder(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      borderSide: BorderSide(color: color, width: width),
    );
  }

  static TextTheme _textTheme(ColorScheme colors) {
    const base = TextStyle(height: AppDimens.lineHeightNormal);
    return TextTheme(
      headlineLarge: base.copyWith(
        fontSize: 32,
        fontWeight: AppDimens.weightExtraBold,
      ),
      headlineMedium: base.copyWith(
        fontSize: 28,
        fontWeight: AppDimens.weightBold,
      ),
      headlineSmall: base.copyWith(
        fontSize: 24,
        fontWeight: AppDimens.weightBold,
      ),
      titleLarge: base.copyWith(fontSize: 21, fontWeight: AppDimens.weightBold),
      titleMedium: base.copyWith(
        fontSize: 18,
        fontWeight: AppDimens.weightSemiBold,
      ),
      titleSmall: base.copyWith(
        fontSize: 16,
        fontWeight: AppDimens.weightSemiBold,
      ),
      bodyLarge: base.copyWith(fontSize: 16),
      bodyMedium: base.copyWith(fontSize: 14),
      bodySmall: base.copyWith(fontSize: 12),
      labelLarge: base.copyWith(
        fontSize: 14,
        fontWeight: AppDimens.weightMedium,
      ),
      labelMedium: base.copyWith(
        fontSize: 12,
        fontWeight: AppDimens.weightMedium,
      ),
      labelSmall: base.copyWith(
        fontSize: 11,
        fontWeight: AppDimens.weightMedium,
      ),
    ).apply(bodyColor: colors.onSurface, displayColor: colors.onSurface);
  }
}
