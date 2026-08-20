import 'package:flutter/material.dart';
import 'app_colors.dart';

/// أبعاد ومسافات متجر مجرات الاوتاكو - نظام تصميم موحد
class AppDimens {
  AppDimens._();

  // ===== المسافات الأساسية (Spacing Scale) =====
  static const double space0 = 0;
  static const double space1 = 2; // xs
  static const double space2 = 4; // xs
  static const double space3 = 8; // sm
  static const double space4 = 12; // sm-md
  static const double space5 = 16; // md (base)
  static const double space6 = 20; // md-lg
  static const double space7 = 24; // lg
  static const double space8 = 28; // lg-xl
  static const double space9 = 32; // xl
  static const double space10 = 40; // 2xl
  static const double space11 = 48; // 3xl
  static const double space12 = 56; // 4xl
  static const double space13 = 64; // 5xl
  static const double space14 = 80; // 6xl

  // مسافات مختصرة للتوافق مع الكود الموجود
  static const double spacingXs = space2;
  static const double spacingSm = space3;
  static const double spacingMd = space5;
  static const double spacingLg = space7;
  static const double spacingXl = space9;

  // ===== نصف القطر (Border Radius) =====
  static const double radiusNone = 0;
  static const double radiusXs = 4;
  static const double radiusSm = 8;
  static const double radiusMd = 12;
  static const double radiusLg = 16;
  static const double radiusXl = 20;
  static const double radius2xl = 24;
  static const double radius3xl = 28;
  static const double radiusFull = 9999;

  // ===== أحجام الأيقونات (Icon Sizes) =====
  static const double iconXs = 12;
  static const double iconSm = 16;
  static const double iconMd = 20;
  static const double iconLg = 24;
  static const double iconXl = 28;
  static const double icon2xl = 32;
  static const double icon3xl = 36;
  static const double icon4xl = 48;
  static const double iconHero = 64;
  static const double iconLogo = 80;

  // ===== أحجام الصور والبطاقات (Image & Card Sizes) =====
  static const double avatarXs = 24;
  static const double avatarSm = 32;
  static const double avatarMd = 40;
  static const double avatarLg = 48;
  static const double avatarXl = 56;
  static const double avatar2xl = 72;
  static const double avatar3xl = 96;

  static const double productCardWidth = 152;
  static const double productCardHeight = 220;
  static const double productImageHeight = 160;

  static const double categoryCardSize = 88;
  static const double categoryIconSize = 36;

  static const double bannerHeight = 160;
  static const double bannerBorderRadius = 16;

  // ===== أبعاد الأزرار (Button Dimensions) =====
  static const double buttonHeightSm = 36;
  static const double buttonHeightMd = 44;
  static const double buttonHeightLg = 52;
  static const double buttonHeightXl = 56;
  static const double buttonMinWidth = 88;

  static const double fabSize = 56;
  static const double fabMiniSize = 40;

  // ===== أبعاد حقول الإدخال (Input Dimensions) =====
  static const double inputHeightSm = 40;
  static const double inputHeightMd = 48;
  static const double inputHeightLg = 56;
  static const double inputBorderRadius = 12;

  // ===== أبعاد شريط التنقل (Navigation) =====
  static const double bottomNavHeight = 72;
  static const double bottomNavIconSize = 24;
  static const double bottomNavLabelSize = 11;

  static const double appBarHeight = 56;
  static const double appBarElevation = 0;

  // ===== أبعاد البطاقات والحاويات (Card & Container) =====
  static const double cardElevation = 0;
  static const double cardBorderWidth = 1;
  static const double cardBorderRadius = 16;
  static const double cardPadding = 12;

  static const double containerBorderRadius = 16;
  static const double containerPadding = 16;

  // ===== أبعاد الشاشات (Screen Dimensions) =====
  static const double screenHorizontalPadding = 16;
  static const double screenVerticalPadding = 16;
  static const double sectionSpacing = 24;
  static const double contentMaxWidth = 480;

  // ===== الظلال (Shadows) - non-const لأن BoxShadow ليس ثابتاً =====
  static List<BoxShadow> get shadowXs => [
    BoxShadow(
      color: AppColors.shadowLight,
      blurRadius: 4,
      offset: const Offset(0, 1),
    ),
  ];

  static List<BoxShadow> get shadowSm => [
    BoxShadow(
      color: AppColors.shadowLight,
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> get shadowMd => [
    BoxShadow(
      color: AppColors.shadowMedium,
      blurRadius: 16,
      offset: const Offset(0, 4),
    ),
  ];

  static List<BoxShadow> get shadowLg => [
    BoxShadow(
      color: AppColors.shadowMedium,
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: AppColors.shadowLight,
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> get shadowGlowPrimary => [
    BoxShadow(
      color: AppColors.glowPrimary,
      blurRadius: 20,
      spreadRadius: 2,
      offset: Offset.zero,
    ),
  ];

  static List<BoxShadow> get shadowGlowSecondary => [
    BoxShadow(
      color: AppColors.glowSecondary,
      blurRadius: 20,
      spreadRadius: 2,
      offset: Offset.zero,
    ),
  ];

  static List<BoxShadow> get shadowGlowAccent => [
    BoxShadow(
      color: AppColors.glowAccent,
      blurRadius: 20,
      spreadRadius: 2,
      offset: Offset.zero,
    ),
  ];

  // ===== مدة الحركات (Animation Durations) =====
  static const Duration durationFast = Duration(milliseconds: 150);
  static const Duration durationNormal = Duration(milliseconds: 250);
  static const Duration durationSlow = Duration(milliseconds: 350);
  static const Duration durationVerySlow = Duration(milliseconds: 500);

  // ===== زوايا المنحنيات (Curve) =====
  static const Curve curveStandard = Curves.easeInOutCubic;
  static const Curve curveEmphasized = Curves.easeOutCubic;
  static const Curve curveDecelerate = Curves.decelerate;
  static const Curve curveSpring = Curves.elasticOut;

  // ===== أحجام الخطوط (Typography Scale) =====
  static const double fontSizeDisplayLarge = 57;
  static const double fontSizeDisplayMedium = 45;
  static const double fontSizeDisplaySmall = 36;

  static const double fontSizeHeadlineLarge = 32;
  static const double fontSizeHeadlineMedium = 28;
  static const double fontSizeHeadlineSmall = 24;

  static const double fontSizeTitleLarge = 22;
  static const double fontSizeTitleMedium = 18;
  static const double fontSizeTitleSmall = 16;

  static const double fontSizeBodyLarge = 16;
  static const double fontSizeBodyMedium = 14;
  static const double fontSizeBodySmall = 12;

  static const double fontSizeLabelLarge = 14;
  static const double fontSizeLabelMedium = 12;
  static const double fontSizeLabelSmall = 11;

  // ===== أوزان الخطوط (Font Weights) =====
  static const FontWeight weightLight = FontWeight.w300;
  static const FontWeight weightRegular = FontWeight.w400;
  static const FontWeight weightMedium = FontWeight.w500;
  static const FontWeight weightSemiBold = FontWeight.w600;
  static const FontWeight weightBold = FontWeight.w700;
  static const FontWeight weightExtraBold = FontWeight.w800;

  // ===== ارتفاع السطر (Line Heights) =====
  static const double lineHeightTight = 1.2;
  static const double lineHeightNormal = 1.5;
  static const double lineHeightRelaxed = 1.6;
  static const double lineHeightLoose = 1.8;

  // ===== عرض الحروف (Letter Spacing) =====
  static const double letterSpacingTight = -0.5;
  static const double letterSpacingNormal = 0;
  static const double letterSpacingWide = 0.5;
  static const double letterSpacingWider = 1.0;
}

/// قيم مختصرة للوصول السريع
extension AppDimensExt on BuildContext {
  double get space1 => AppDimens.space1;
  double get space2 => AppDimens.space2;
  double get space3 => AppDimens.space3;
  double get space4 => AppDimens.space4;
  double get space5 => AppDimens.space5;
  double get space6 => AppDimens.space6;
  double get space7 => AppDimens.space7;
  double get space8 => AppDimens.space8;
  double get space9 => AppDimens.space9;
  double get space10 => AppDimens.space10;

  double get radiusSm => AppDimens.radiusSm;
  double get radiusMd => AppDimens.radiusMd;
  double get radiusLg => AppDimens.radiusLg;
  double get radiusXl => AppDimens.radiusXl;
  double get radiusFull => AppDimens.radiusFull;

  double get screenPaddingH => AppDimens.screenHorizontalPadding;
  double get screenPaddingV => AppDimens.screenVerticalPadding;
}
