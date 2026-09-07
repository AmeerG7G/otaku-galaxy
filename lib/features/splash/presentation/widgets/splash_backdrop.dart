import 'package:flutter/material.dart';

import '../../../../core/design_system/tokens/app_colors.dart';

/// الخلفية الثابتة لشاشة البداية كما في مرجع التصميم.
///
/// تتألف من:
/// - تدرّج خلفية فاتح ثابت `linear-gradient(170deg,#fdf3f8,#f2ebfe 46%,#e9e2fb)`
///   يعمل بالهوية نفسها في الوضعين الفاتح والداكن (المرجع يبقى هذه الدرجات
///   المشفّرة حرفياً ولا يبدّلها مع السمة الداكنة).
/// - هالتان لونيتان: وردية أعلى الجهة اليمنى الفيزيائية، وبنفسجية أسفل
///   الجهة اليسرى الفيزيائية.
/// - رسمان أنمي خافتان (مخفّضا التشبّع) في الزاويتين المقابلتين.
///
/// مواضع الرسوم في المصدر فيزيائية (left/right) ولا تنعكس مع اتجاه النص،
/// لذا: `right` ← `start` و`left` ← `end` في واجهة عربية.
class SplashBackdrop extends StatelessWidget {
  const SplashBackdrop({super.key});

  /// `linear-gradient(170deg,#fdf3f8 0%,#f2ebfe 46%,#e9e2fb 100%)` —
  /// نفسه دوماً في الوضعين الفاتح والداكن كما في المرجع.
  static const LinearGradient gradient = LinearGradient(
    colors: [
      Color(0xFFFDF3F8),
      Color(0xFFF2EBFE),
      Color(0xFFE9E2FB),
    ],
    stops: [0, 0.46, 1],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: gradient),
      child: const Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          // هالة وردية — أعلى الجهة اليمنى الفيزيائية (right في المصدر).
          PositionedDirectional(
            top: -110,
            start: -90,
            child: _Halo(size: 320, color: AppColors.secondary, alpha: 0.30),
          ),
          // هالة بنفسجية — أسفل الجهة اليسرى الفيزيائية (left في المصدر).
          PositionedDirectional(
            bottom: -120,
            end: -100,
            child: _Halo(size: 340, color: AppColors.primary, alpha: 0.28),
          ),
          // رسوم خافتة خلف المحتوى — تزيينية بحتة، لا تُستخدم كصور منتجات.
          PositionedDirectional(
            bottom: -30,
            end: -56,
            child: _FadedArt(
              asset: 'assets/art/opt/gojo-l.png',
              width: 250,
              opacity: 0.17,
            ),
          ),
          PositionedDirectional(
            top: 64,
            start: -38,
            child: _FadedArt(
              asset: 'assets/art/opt/a-i0.png',
              width: 132,
              opacity: 0.15,
            ),
          ),
        ],
      ),
    );
  }
}

/// هالة لونية دائرية تتلاشى للشفاف عند ٦٦٪ من نصف القطر.
class _Halo extends StatelessWidget {
  const _Halo({required this.size, required this.color, required this.alpha});

  final double size;
  final Color color;
  final double alpha;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [
              color.withValues(alpha: alpha),
              color.withValues(alpha: 0),
            ],
            stops: const [0, 0.66],
          ),
        ),
      ),
    );
  }
}

/// رسم أنمي تزييني خافت — مخفَّض التشبّع كما في المصدر.
class _FadedArt extends StatelessWidget {
  const _FadedArt({
    required this.asset,
    required this.width,
    required this.opacity,
  });

  final String asset;
  final double width;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Opacity(
        opacity: opacity,
        child: ColorFiltered(
          // ‎filter:saturate(.5) في المصدر.
          colorFilter: const ColorFilter.matrix(<double>[
            0.6065, 0.3576, 0.0359, 0, 0, //
            0.1065, 0.8576, 0.0359, 0, 0, //
            0.1065, 0.3576, 0.5359, 0, 0, //
            0, 0, 0, 1, 0, //
          ]),
          child: Image.asset(asset, width: width, fit: BoxFit.contain),
        ),
      ),
    );
  }
}
