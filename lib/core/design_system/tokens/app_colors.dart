import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF4A42B8);
  static const Color primaryLight = Color(0xFF7167E8);
  static const Color primaryDark = Color(0xFF282064);
  static const Color primaryPale = Color(0xFFECEBFF);

  static const Color secondary = Color(0xFFE256A5);
  static const Color secondaryLight = Color(0xFFF28BC5);
  static const Color secondaryDark = Color(0xFF9D2C70);

  static const Color accent = Color(0xFFF4BE58);
  static const Color accentOrange = Color(0xFFEC914E);
  static const Color accentCyan = Color(0xFF4EA5EB);

  static const Color success = Color(0xFF198754);
  static const Color successLight = Color(0xFF42B883);
  static const Color successPale = Color(0xFFE3F7EC);
  static const Color warning = Color(0xFFC77A12);
  static const Color warningLight = Color(0xFFE9A23B);
  static const Color warningPale = Color(0xFFFFF3DD);
  static const Color error = Color(0xFFC83E58);
  static const Color errorLight = Color(0xFFE76B7F);
  static const Color errorPale = Color(0xFFFFE9ED);
  static const Color info = Color(0xFF2B79C2);
  static const Color infoLight = Color(0xFF63A8E8);
  static const Color infoPale = Color(0xFFE7F2FF);

  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFF2F3FA);
  static const Color surfaceElevated = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFF8F8FD);
  static const Color backgroundSecondary = Color(0xFFEEF0F9);
  static const Color onSurface = Color(0xFF1C1B2A);
  static const Color onSurfaceVariant = Color(0xFF666579);
  static const Color onSurfaceDisabled = Color(0xFFA5A4B4);
  static const Color onBackground = Color(0xFF1C1B2A);
  static const Color onBackgroundVariant = Color(0xFF747287);
  static const Color outline = Color(0xFFD9D8E6);
  static const Color outlineVariant = Color(0xFFEAE9F2);
  static const Color divider = Color(0xFFE7E6EF);

  static const Color shadowLight = Color(0x12453B94);
  static const Color shadowMedium = Color(0x24453B94);
  static const Color shadowDark = Color(0x3A453B94);
  static const Color glowPrimary = Color(0x334A42B8);
  static const Color glowSecondary = Color(0x33E256A5);
  static const Color glowAccent = Color(0x33F4BE58);

  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF3D348C), primaryLight],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
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
    colors: [Color(0xFF302579), Color(0xFF6352CD), Color(0xFFE25AA6)],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient bannerGradient = LinearGradient(
    colors: [Color(0xFF1B153F), Color(0xFF4935A6), Color(0xFFC44794)],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );

  static const Map<String, Color> categoryColors = {
    'ملابس': Color(0xFF7167E8),
    'قرطاسية': Color(0xFF4EA5EB),
    'حقائب': Color(0xFFF4BE58),
    'إكسسوارات': Color(0xFFE256A5),
  };

  static const ColorScheme lightColorScheme = ColorScheme(
    brightness: Brightness.light,
    primary: primary,
    onPrimary: Colors.white,
    primaryContainer: primaryPale,
    onPrimaryContainer: primaryDark,
    secondary: secondary,
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFFFE8F3),
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
    shadow: Color(0xFF171420),
    inverseSurface: Color(0xFF242035),
    onInverseSurface: Color(0xFFF5F2FA),
    inversePrimary: primaryLight,
    surfaceTint: primary,
  );

  static const ColorScheme darkColorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFAAA2FF),
    onPrimary: Color(0xFF21195C),
    primaryContainer: Color(0xFF3D347B),
    onPrimaryContainer: Color(0xFFEAE8FF),
    secondary: Color(0xFFFFA4D4),
    onSecondary: Color(0xFF5D1542),
    secondaryContainer: Color(0xFF7A2858),
    onSecondaryContainer: Color(0xFFFFE7F3),
    tertiary: Color(0xFFFFD98D),
    onTertiary: Color(0xFF543B00),
    tertiaryContainer: Color(0xFF745400),
    onTertiaryContainer: Color(0xFFFFEEC7),
    error: Color(0xFFFFB1C0),
    onError: Color(0xFF68001B),
    errorContainer: Color(0xFF92002E),
    onErrorContainer: Color(0xFFFFD9DF),
    surface: Color(0xFF141024),
    onSurface: Color(0xFFE9E5F3),
    surfaceContainerHighest: Color(0xFF29233B),
    onSurfaceVariant: Color(0xFFC9C3D7),
    outline: Color(0xFF948EA2),
    outlineVariant: Color(0xFF474152),
    shadow: Colors.black,
    inverseSurface: Color(0xFFE9E5F3),
    onInverseSurface: Color(0xFF29233B),
    inversePrimary: primary,
    surfaceTint: Color(0xFFAAA2FF),
  );
}
