import 'package:flutter/material.dart';
import 'app_colors.dart';

/// ألوان مخصصة للثيم - للوصول عبر امتداد الثيم.
class AppThemeColors extends ThemeExtension<AppThemeColors> {
  const AppThemeColors({
    required this.accent,
    required this.accentOrange,
    required this.accentCyan,
    required this.success,
    required this.successLight,
    required this.successPale,
    required this.warning,
    required this.warningLight,
    required this.warningPale,
    required this.error,
    required this.errorLight,
    required this.errorPale,
    required this.info,
    required this.infoLight,
    required this.infoPale,
    required this.shadowLight,
    required this.shadowMedium,
    required this.shadowDark,
    required this.glowPrimary,
    required this.glowSecondary,
    required this.glowAccent,
    required this.primaryGradient,
    required this.secondaryGradient,
    required this.accentGradient,
    required this.surfaceGradient,
    required this.animeHeroGradient,
    required this.bannerGradient,
  });

  // Semantic colors
  final Color accent;
  final Color accentOrange;
  final Color accentCyan;
  final Color success;
  final Color successLight;
  final Color successPale;
  final Color warning;
  final Color warningLight;
  final Color warningPale;
  final Color error;
  final Color errorLight;
  final Color errorPale;
  final Color info;
  final Color infoLight;
  final Color infoPale;

  // Shadows & Glow
  final Color shadowLight;
  final Color shadowMedium;
  final Color shadowDark;
  final Color glowPrimary;
  final Color glowSecondary;
  final Color glowAccent;

  // Gradients
  final LinearGradient primaryGradient;
  final LinearGradient secondaryGradient;
  final LinearGradient accentGradient;
  final LinearGradient surfaceGradient;
  final LinearGradient animeHeroGradient;
  final LinearGradient bannerGradient;

  static const AppThemeColors light = AppThemeColors(
    accent: AppColors.accent,
    accentOrange: AppColors.accentOrange,
    accentCyan: AppColors.accentCyan,
    success: AppColors.success,
    successLight: AppColors.successLight,
    successPale: AppColors.successPale,
    warning: AppColors.warning,
    warningLight: AppColors.warningLight,
    warningPale: AppColors.warningPale,
    error: AppColors.error,
    errorLight: AppColors.errorLight,
    errorPale: AppColors.errorPale,
    info: AppColors.info,
    infoLight: AppColors.infoLight,
    infoPale: AppColors.infoPale,
    shadowLight: AppColors.shadowLight,
    shadowMedium: AppColors.shadowMedium,
    shadowDark: AppColors.shadowDark,
    glowPrimary: AppColors.glowPrimary,
    glowSecondary: AppColors.glowSecondary,
    glowAccent: AppColors.glowAccent,
    primaryGradient: AppColors.primaryGradient,
    secondaryGradient: AppColors.secondaryGradient,
    accentGradient: AppColors.accentGradient,
    surfaceGradient: AppColors.surfaceGradient,
    animeHeroGradient: AppColors.animeHeroGradient,
    bannerGradient: AppColors.bannerGradient,
  );

  static const AppThemeColors dark = AppThemeColors(
    accent: AppColors.accent,
    accentOrange: AppColors.accentOrange,
    accentCyan: AppColors.accentCyan,
    success: AppColors.successLight,
    successLight: AppColors.successLight,
    successPale: Color(0xFF173D31),
    warning: AppColors.warningLight,
    warningLight: AppColors.warningLight,
    warningPale: Color(0xFF4D3510),
    error: AppColors.errorLight,
    errorLight: AppColors.errorLight,
    errorPale: Color(0xFF4A1926),
    info: AppColors.infoLight,
    infoLight: AppColors.infoLight,
    infoPale: Color(0xFF162F4A),
    shadowLight: Color(0x40000000),
    shadowMedium: Color(0x59000000),
    shadowDark: Color(0x80000000),
    glowPrimary: Color(0x557C5CFF),
    glowSecondary: Color(0x55FF3D8F),
    glowAccent: Color(0x55FFB02E),
    primaryGradient: LinearGradient(
      colors: [Color(0xFFFF3D8F), Color(0xFFB3A2FF)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    secondaryGradient: LinearGradient(
      colors: [Color(0xFFFF7FAE), Color(0xFFFF3D8F)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    accentGradient: LinearGradient(
      colors: [Color(0xFFFFD98D), Color(0xFFEC914E)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    surfaceGradient: LinearGradient(
      colors: [Color(0xFF0B0716), Color(0xFF130C24)],
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
    ),
    animeHeroGradient: LinearGradient(
      colors: [Color(0xFFFF3D8F), Color(0xFF7C5CFF), Color(0xFF4EA8FF)],
      stops: [0.0, 0.58, 1.0],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    bannerGradient: LinearGradient(
      colors: [Color(0xFFFF3D8F), Color(0xFF7C5CFF), Color(0xFF4EA8FF)],
      stops: [0.0, 0.58, 1.0],
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
    ),
  );

  /// تدرّج ثابت (فاتح/داكن) لخلفية شاشات المصادقة — من هوية التصميم مباشرة.
  static const LinearGradient authGradientLight = LinearGradient(
    colors: [Color(0xFFFFD9E7), Color(0xFFE9DCFF), Color(0xFFDBE6FF)],
    stops: [0.0, 0.52, 1.0],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  static const LinearGradient authGradientDark = LinearGradient(
    colors: [Color(0xFF3D1C44), Color(0xFF2B1A50), Color(0xFF1A2348)],
    stops: [0.0, 0.52, 1.0],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  // ═══ رموز Otaku Galaxy v2 المشتقّة ═══
  // تُشتق من [surfaceGradient] بدل إضافة حقول جديدة، حتى تبقى عقود
  // copyWith/lerp الحالية سليمة بلا تغيير.

  /// هل النسخة الداكنة؟ (أول لون في تدرّج السطح داكن).
  bool get isDarkScheme =>
      surfaceGradient.colors.first.computeLuminance() < 0.5;

  /// خلفية حاوية صورة المنتج (--ph) — محايدة دائماً.
  Color get photoSlot =>
      isDarkScheme ? const Color(0xFF221A3D) : const Color(0xFFEFEAFA);

  /// لون مؤشّر الصورة داخل الحاوية (--ph-ink).
  Color get photoSlotInk =>
      isDarkScheme ? const Color(0xFF6A5F92) : const Color(0xFFB3A9CF);

  /// الظل الناعم (--sh-s) لبطاقات المنتجات والأسطح المرفوعة.
  List<BoxShadow> get shadowSoft => [
    BoxShadow(
      color: isDarkScheme
          ? const Color(0x5C000000)
          : const Color(0x1A4A2C8C),
      blurRadius: 20,
      offset: const Offset(0, 8),
    ),
  ];

  /// ظل خفيف جداً (--sh-xs) للعناصر الصغيرة العائمة.
  List<BoxShadow> get shadowXSoft => [
    BoxShadow(
      color: isDarkScheme
          ? const Color(0x4D000000)
          : const Color(0x144A2C8C),
      blurRadius: 10,
      offset: const Offset(0, 3),
    ),
  ];

  /// ظل عميق (--sh) للأسطح العائمة كشريط التنقل السفلي والأوراق.
  List<BoxShadow> get shadowFloating => [
    BoxShadow(
      color: isDarkScheme
          ? const Color(0x80000000)
          : const Color(0x244A2C8C),
      blurRadius: 40,
      offset: const Offset(0, 18),
    ),
  ];

  @override
  AppThemeColors copyWith({
    Color? accent,
    Color? accentOrange,
    Color? accentCyan,
    Color? success,
    Color? successLight,
    Color? successPale,
    Color? warning,
    Color? warningLight,
    Color? warningPale,
    Color? error,
    Color? errorLight,
    Color? errorPale,
    Color? info,
    Color? infoLight,
    Color? infoPale,
    Color? shadowLight,
    Color? shadowMedium,
    Color? shadowDark,
    Color? glowPrimary,
    Color? glowSecondary,
    Color? glowAccent,
    LinearGradient? primaryGradient,
    LinearGradient? secondaryGradient,
    LinearGradient? accentGradient,
    LinearGradient? surfaceGradient,
    LinearGradient? animeHeroGradient,
    LinearGradient? bannerGradient,
  }) {
    return AppThemeColors(
      accent: accent ?? this.accent,
      accentOrange: accentOrange ?? this.accentOrange,
      accentCyan: accentCyan ?? this.accentCyan,
      success: success ?? this.success,
      successLight: successLight ?? this.successLight,
      successPale: successPale ?? this.successPale,
      warning: warning ?? this.warning,
      warningLight: warningLight ?? this.warningLight,
      warningPale: warningPale ?? this.warningPale,
      error: error ?? this.error,
      errorLight: errorLight ?? this.errorLight,
      errorPale: errorPale ?? this.errorPale,
      info: info ?? this.info,
      infoLight: infoLight ?? this.infoLight,
      infoPale: infoPale ?? this.infoPale,
      shadowLight: shadowLight ?? this.shadowLight,
      shadowMedium: shadowMedium ?? this.shadowMedium,
      shadowDark: shadowDark ?? this.shadowDark,
      glowPrimary: glowPrimary ?? this.glowPrimary,
      glowSecondary: glowSecondary ?? this.glowSecondary,
      glowAccent: glowAccent ?? this.glowAccent,
      primaryGradient: primaryGradient ?? this.primaryGradient,
      secondaryGradient: secondaryGradient ?? this.secondaryGradient,
      accentGradient: accentGradient ?? this.accentGradient,
      surfaceGradient: surfaceGradient ?? this.surfaceGradient,
      animeHeroGradient: animeHeroGradient ?? this.animeHeroGradient,
      bannerGradient: bannerGradient ?? this.bannerGradient,
    );
  }

  @override
  AppThemeColors lerp(ThemeExtension<AppThemeColors>? other, double t) {
    if (other is! AppThemeColors) return this;
    return AppThemeColors(
      accent: Color.lerp(accent, other.accent, t)!,
      accentOrange: Color.lerp(accentOrange, other.accentOrange, t)!,
      accentCyan: Color.lerp(accentCyan, other.accentCyan, t)!,
      success: Color.lerp(success, other.success, t)!,
      successLight: Color.lerp(successLight, other.successLight, t)!,
      successPale: Color.lerp(successPale, other.successPale, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      warningLight: Color.lerp(warningLight, other.warningLight, t)!,
      warningPale: Color.lerp(warningPale, other.warningPale, t)!,
      error: Color.lerp(error, other.error, t)!,
      errorLight: Color.lerp(errorLight, other.errorLight, t)!,
      errorPale: Color.lerp(errorPale, other.errorPale, t)!,
      info: Color.lerp(info, other.info, t)!,
      infoLight: Color.lerp(infoLight, other.infoLight, t)!,
      infoPale: Color.lerp(infoPale, other.infoPale, t)!,
      shadowLight: Color.lerp(shadowLight, other.shadowLight, t)!,
      shadowMedium: Color.lerp(shadowMedium, other.shadowMedium, t)!,
      shadowDark: Color.lerp(shadowDark, other.shadowDark, t)!,
      glowPrimary: Color.lerp(glowPrimary, other.glowPrimary, t)!,
      glowSecondary: Color.lerp(glowSecondary, other.glowSecondary, t)!,
      glowAccent: Color.lerp(glowAccent, other.glowAccent, t)!,
      primaryGradient: _lerpGradient(primaryGradient, other.primaryGradient, t),
      secondaryGradient: _lerpGradient(
        secondaryGradient,
        other.secondaryGradient,
        t,
      ),
      accentGradient: _lerpGradient(accentGradient, other.accentGradient, t),
      surfaceGradient: _lerpGradient(surfaceGradient, other.surfaceGradient, t),
      animeHeroGradient: _lerpGradient(
        animeHeroGradient,
        other.animeHeroGradient,
        t,
      ),
      bannerGradient: _lerpGradient(bannerGradient, other.bannerGradient, t),
    );
  }

  static LinearGradient _lerpGradient(
    LinearGradient a,
    LinearGradient b,
    double t,
  ) {
    return LinearGradient(
      colors: List.generate(
        a.colors.length,
        (i) => Color.lerp(a.colors[i], b.colors[i], t)!,
      ),
      begin: a.begin,
      end: a.end,
      stops: a.stops,
      tileMode: a.tileMode,
    );
  }
}

/// امتداد للوصول السهل للألوان المخصصة
extension AppThemeColorsExt on BuildContext {
  AppThemeColors get themeColors =>
      Theme.of(this).extension<AppThemeColors>() ?? AppThemeColors.light;

  Color get accent => themeColors.accent;
  Color get accentOrange => themeColors.accentOrange;
  Color get accentCyan => themeColors.accentCyan;
  Color get success => themeColors.success;
  Color get successPale => themeColors.successPale;
  Color get warning => themeColors.warning;
  Color get warningPale => themeColors.warningPale;
  Color get errorColor => themeColors.error;
  Color get errorPale => themeColors.errorPale;

  LinearGradient get primaryGradient => themeColors.primaryGradient;
  LinearGradient get secondaryGradient => themeColors.secondaryGradient;
  LinearGradient get accentGradient => themeColors.accentGradient;
  LinearGradient get animeHeroGradient => themeColors.animeHeroGradient;
  LinearGradient get bannerGradient => themeColors.bannerGradient;
}
