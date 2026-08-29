import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF7C5CFF);
  static const Color primaryLight = Color(0xFFA08CFF);
  static const Color primaryDark = Color(0xFF4A2FBF);
  static const Color primaryPale = Color(0xFFECEBFF);

  static const Color secondary = Color(0xFFFF3D8F);
  static const Color secondaryLight = Color(0xFFFF6FAE);
  static const Color secondaryDark = Color(0xFFB8195F);
  static const Color secondaryPale = Color(0xFFFFE3EF);

  static const Color accent = Color(0xFFFFB02E);
  static const Color accentOrange = Color(0xFFEC914E);
  static const Color accentCyan = Color(0xFF4EA8FF);

  static const Color success = Color(0xFF22B07D);
  static const Color successLight = Color(0xFF4FCB9C);
  static const Color successPale = Color(0xFFE3F7EC);
  static const Color warning = Color(0xFFC77A12);
  static const Color warningLight = Color(0xFFFFB02E);
  static const Color warningPale = Color(0xFFFFF3DD);
  static const Color error = Color(0xFFFF5A7A);
  static const Color errorLight = Color(0xFFFF8AA2);
  static const Color errorPale = Color(0xFFFFE9ED);
  static const Color info = Color(0xFF2B79C2);
  static const Color infoLight = Color(0xFF4EA8FF);
  static const Color infoPale = Color(0xFFE7F2FF);

  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFF6F2FE);
  static const Color surfaceElevated = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFF7F5FC);
  static const Color backgroundSecondary = Color(0xFFEFE9FB);
  static const Color onSurface = Color(0xFF180F30);
  static const Color onSurfaceVariant = Color(0xFF6F6690);
  static const Color onSurfaceDisabled = Color(0xFF9C94B8);
  static const Color onBackground = Color(0xFF180F30);
  static const Color onBackgroundVariant = Color(0xFF6F6690);
  static const Color outline = Color(0x1F1C103A);
  static const Color outlineVariant = Color(0x1A1C103A);
  static const Color divider = Color(0x1A1C103A);

  static const Color shadowLight = Color(0x14332C8C);
  static const Color shadowMedium = Color(0x24332C8C);
  static const Color shadowDark = Color(0x3A332C8C);
  static const Color glowPrimary = Color(0x337C5CFF);
  static const Color glowSecondary = Color(0x33FF3D8F);
  static const Color glowAccent = Color(0x33FFB02E);

  static const LinearGradient primaryGradient = LinearGradient(
    colors: [secondary, primary],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  /// تدرّج أزرار الإجراء الرئيسية — `linear-gradient(135deg, pink, violet)`
  /// في مصدر التصميم: وردي على اليسار الفيزيائي وبنفسجي على اليمين.
  ///
  /// منفصل عن [primaryGradient] عمداً: هذا الأخير يلوّن أسطحاً أخرى (بطاقة
  /// الحساب، عنصر التنقّل المرفوع) باتجاه معاكس في المراجع.
  static const LinearGradient ctaGradient = LinearGradient(
    colors: [secondary, primary],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient secondaryGradient = LinearGradient(
    colors: [Color(0xFFC63C91), secondaryLight],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient accentGradient = LinearGradient(
    colors: [Color(0xFFE7A93D), accent],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient surfaceGradient = LinearGradient(
    colors: [background, Color(0xFFFFFFFF)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  static const LinearGradient animeHeroGradient = LinearGradient(
    colors: [Color(0xFFFF3D8F), Color(0xFF7C5CFF), Color(0xFF4EA8FF)],
    stops: [0.0, 0.58, 1.0],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient bannerGradient = LinearGradient(
    colors: [Color(0xFFFF3D8F), Color(0xFF7C5CFF), Color(0xFF4EA8FF)],
    stops: [0.0, 0.58, 1.0],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient authGradient = LinearGradient(
    colors: [Color(0xFFFFD9E7), Color(0xFFE9DCFF), Color(0xFFDBE6FF)],
    stops: [0.0, 0.52, 1.0],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const Map<String, Color> categoryColors = {
    'ملابس': primary,
    'قرطاسية': accentCyan,
    'حقائب': accent,
    'إكسسوارات': secondary,
  };

  static const ColorScheme lightColorScheme = ColorScheme(
    brightness: Brightness.light,
    primary: primary,
    onPrimary: Colors.white,
    primaryContainer: primaryPale,
    onPrimaryContainer: primaryDark,
    secondary: secondary,
    onSecondary: Colors.white,
    secondaryContainer: secondaryPale,
    onSecondaryContainer: secondaryDark,
    tertiary: accent,
    onTertiary: Color(0xFF3A2600),
    tertiaryContainer: Color(0xFFFFEFCB),
    onTertiaryContainer: Color(0xFF5B3A00),
    error: error,
    onError: Colors.white,
    errorContainer: errorPale,
    onErrorContainer: Color(0xFF6B1025),
    surface: surface,
    onSurface: onSurface,
    surfaceContainerHighest: surfaceVariant,
    onSurfaceVariant: onSurfaceVariant,
    outline: outline,
    outlineVariant: outlineVariant,
    shadow: Color(0xFF180F30),
    inverseSurface: Color(0xFF241943),
    onInverseSurface: Color(0xFFF7F4FF),
    inversePrimary: primaryLight,
    surfaceTint: primary,
  );

  static const ColorScheme darkColorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFB3A2FF),
    onPrimary: Color(0xFF241355),
    primaryContainer: Color(0xFF3D2B7A),
    onPrimaryContainer: Color(0xFFEAE5FF),
    secondary: Color(0xFFFF7FAE),
    onSecondary: Color(0xFF56072B),
    secondaryContainer: Color(0xFF7A1F49),
    onSecondaryContainer: Color(0xFFFFE1EC),
    tertiary: Color(0xFFFFD98D),
    onTertiary: Color(0xFF543B00),
    tertiaryContainer: Color(0xFF745400),
    onTertiaryContainer: Color(0xFFFFEEC7),
    error: Color(0xFFFF8AA2),
    onError: Color(0xFF5C0018),
    errorContainer: Color(0xFF7F0028),
    onErrorContainer: Color(0xFFFFD9DF),
    surface: Color(0xFF191131),
    onSurface: Color(0xFFF7F4FF),
    surfaceContainerHighest: Color(0xFF231A44),
    onSurfaceVariant: Color(0xFFA79DC9),
    outline: Color(0xFF7D739E),
    outlineVariant: Color(0x1AFFFFFF),
    shadow: Colors.black,
    inverseSurface: Color(0xFFF7F4FF),
    onInverseSurface: Color(0xFF231A44),
    inversePrimary: primary,
    surfaceTint: Color(0xFFB3A2FF),
  );
}
