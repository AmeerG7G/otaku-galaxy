import 'package:flutter/material.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// STAGE 12 — OTAKU GALAXY BRAND REFRESH
///
/// اللوحة المعتمدة من نظام الهوية (المرحلة ٠٢). الأحمر والأخضر والأزرق
/// الوظيفية بقيت كما هي: هي إشارات لا هوية، وتغييرها يمسّ المعنى لا الشكل.
///
/// الألوان الستّة للعلامة — كما في الشعار المعتمد:
///   magenta #F0459B · violet #8B5CF6 · blue #4FA3F0
///   indigo  #3B2FA8 · purple #6D3BC0 · gold  #F6C144
/// الأرضية الداكنة: #0B0718 — والأسطح: #120C24 · #16102E · #241A54
/// ═══════════════════════════════════════════════════════════════════════
class AppColors {
  AppColors._();

  // ═══ البنفسجي — اللون الأول ═══
  static const Color primary = Color(0xFF8B5CF6);
  static const Color primaryLight = Color(0xFFA78BFA);
  static const Color primaryDark = Color(0xFF6D3BC0); // بنفسجي اللوحة المعتمد
  static const Color primaryPale = Color(0xFFEDE7FE);

  // ═══ الأرجواني — اللون الثاني ═══
  static const Color secondary = Color(0xFFF0459B);
  static const Color secondaryLight = Color(0xFFF573B3);
  static const Color secondaryDark = Color(0xFFA81560);
  static const Color secondaryPale = Color(0xFFFDE3EF);

  // ═══ الذهبي والأزرق ═══
  static const Color accent = Color(0xFFF6C144);
  static const Color accentOrange = Color(0xFFE09A3E);
  static const Color accentCyan = Color(0xFF4FA3F0);

  /// النيلي — اللون الرابع في الشعار. مضاف لأن اللوحة السابقة لم تسمِّه،
  /// وكان يُكتب حرفياً (`0xFF3D2B7A`) في حاوية البنفسجي الداكنة.
  static const Color indigo = Color(0xFF3B2FA8);

  // ═══ ألوان الحالة — لم تُمسّ ═══
  //
  // [STAGE 12] هذه إشاراتٌ وظيفية لا ألوانَ علامة. تغييرها يُبدّل معنى
  // النجاح والخطأ لا مظهرهما، وهو خارج نطاق تحديث الهوية. بقيت كما وُجدت.
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

  // ═══ صيغ نصّية من ألوان الحالة ═══
  //
  // [CRITICAL] الألوان أعلاه مضبوطة **مؤشِّراتٍ**: أيقونات وحدود وشارات
  // ملوّنة، حيث الحدّ ٣:١. استعمالُها لوناً لنصّ على سطحٍ فاتح يرسب: القياس
  // على `surfaceVariant` أعطى 2.52:1 للأخضر و2.72:1 للأحمر و4.13:1 للأزرق —
  // كلها دون حدّ AA للنصّ (4.5:1).
  //
  // هذه الصيغ أغمق من مقابلاتها بالقدر الذي يجتاز الحدّ ويحفظ الدرجة نفسها،
  // وتُستعمل **للنصّ وحده**. الوضع الداكن لا يحتاجها: نصوصه تُرسم بالصيغة
  // الفاتحة على سطحٍ داكن فتجتاز أصلاً (5.92:1 و6.45:1).
  static const Color successText = Color(0xFF0F7A55);
  static const Color errorText = Color(0xFFC42544);
  static const Color infoText = Color(0xFF1C63A3);

  // ═══ الأسطح الفاتحة — لم تُمسّ ═══
  //
  // [STAGE 12 · DECISION 01] التطبيق يبقى فاتحاً افتراضياً. أسطح الوضع
  // الفاتح ونصوصه بقيت كما وُجدت حتى لا يتغيّر ما يراه المستخدم الحالي.
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

  // ═══ الأرضية الداكنة المعتمدة ═══
  /// أرضية العلامة — تُستعمل خلفيةً للوضع الداكن ولأيقونة التطبيق.
  static const Color groundDark = Color(0xFF0B0718);
  static const Color surfaceDark = Color(0xFF120C24);
  static const Color surfaceDarkElevated = Color(0xFF16102E);
  static const Color surfaceDarkRaised = Color(0xFF241A54);
  static const Color onSurfaceDark = Color(0xFFEDEAF6);
  static const Color onSurfaceDarkVariant = Color(0xFF8E86B8);

  /// حبر داكن يُقرأ على الذهبي — الذهبي فاتح فلا يحمل نصّاً أبيض.
  static const Color onAccent = Color(0xFF2A1E04);

  // ═══ الظلال والهالات — أُعيد صبغها إلى النيلي ═══
  static const Color shadowLight = Color(0x143B2FA8);
  static const Color shadowMedium = Color(0x243B2FA8);
  static const Color shadowDark = Color(0x3A3B2FA8);
  static const Color glowPrimary = Color(0x338B5CF6);
  static const Color glowSecondary = Color(0x33F0459B);
  static const Color glowAccent = Color(0x33F6C144);

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
    colors: [Color(0xFFC2357E), secondaryLight],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient accentGradient = LinearGradient(
    colors: [Color(0xFFDCA22F), accent],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient surfaceGradient = LinearGradient(
    colors: [background, Color(0xFFFFFFFF)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  // [STAGE 12] كانت هذه التدرّجات تكتب ألوانها حرفياً فتنفصل عن اللوحة
  // كلّما تغيّرت. صارت تقرأ الرموز، فلا يمكن أن تنحرف مرّة أخرى.
  static const LinearGradient animeHeroGradient = LinearGradient(
    colors: [secondary, primary, accentCyan],
    stops: [0.0, 0.58, 1.0],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient bannerGradient = LinearGradient(
    colors: [secondary, primary, accentCyan],
    stops: [0.0, 0.58, 1.0],
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );
  static const LinearGradient authGradient = LinearGradient(
    colors: [Color(0xFFFDE0EC), Color(0xFFE9E1FD), Color(0xFFDCE9FC)],
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

  /// تدرّجات بطاقات الأقسام.
  ///
  /// [STAGE 12] نُقلت من `anime_category_card.dart` حيث كانت تُكتب حرفياً
  /// وتتجاوز طبقة الرموز كلّها. القائمة نفسها بالترتيب نفسه — ستّة أزواج —
  /// ولكنها الآن تقرأ الرموز فتتبع اللوحة تلقائياً.
  ///
  /// الزوجان ٢ و٥ كانا يستعملان الأخضر `#22B07D`، وهو لونٌ وظيفيّ (نجاح)
  /// وليس من ألوان العلامة الستّة. أُبدل بالنيلي والبنفسجي الداكن — وهذا
  /// **يغيّر هوية لونَي قسمين**، فراجعه قبل الدمج.
  static const List<List<Color>> categoryGradients = [
    [accentOrange, secondary], // 0 — قرطاسية
    [accentCyan, primary], // 1 — ملابس
    [accentCyan, indigo], // 2 — حقائب  ← كان أخضر→أزرق
    [secondary, primary], // 3 — إكسسوارات
    [accent, secondaryLight], // 4 — منتجات أنمي متنوعة
    [primary, primaryDark], // 5 — مجسمات وهدايا  ← كان بنفسجي→أخضر
  ];

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
    onTertiary: onAccent,
    tertiaryContainer: Color(0xFFFCEBC4),
    onTertiaryContainer: Color(0xFF5B4406),
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
    inverseSurface: surfaceDarkRaised,
    onInverseSurface: onSurfaceDark,
    inversePrimary: primaryLight,
    surfaceTint: primary,
  );

  static const ColorScheme darkColorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFB79DFA),
    onPrimary: Color(0xFF23124F),
    primaryContainer: indigo,
    onPrimaryContainer: onSurfaceDark,
    secondary: secondaryLight,
    onSecondary: Color(0xFF4A0A2C),
    secondaryContainer: Color(0xFF8C2159),
    onSecondaryContainer: secondaryPale,
    tertiary: Color(0xFFF8D177),
    onTertiary: onAccent,
    tertiaryContainer: Color(0xFF8A6410),
    onTertiaryContainer: Color(0xFFFCEBC4),
    error: Color(0xFFFF8AA2),
    onError: Color(0xFF5C0018),
    errorContainer: Color(0xFF7F0028),
    onErrorContainer: Color(0xFFFFD9DF),
    surface: groundDark,
    onSurface: onSurfaceDark,
    surfaceContainerHighest: surfaceDarkElevated,
    onSurfaceVariant: onSurfaceDarkVariant,
    outline: Color(0xFF7A719C),
    outlineVariant: Color(0x1AFFFFFF),
    shadow: Colors.black,
    inverseSurface: onSurfaceDark,
    onInverseSurface: surfaceDarkElevated,
    inversePrimary: primary,
    surfaceTint: Color(0xFFB79DFA),
  );
}
