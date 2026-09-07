import 'package:flutter/material.dart';

import '../../../../core/design_system/tokens/app_colors.dart';

/// الخلفية الثابتة لشاشة البداية كما في مرجع التصميم.
///
/// تتألف من:
/// - تدرّج خلفية فاتح ثابت `linear-gradient(170deg,#fef3f9,#f2edfe 46%,#ebe3fd)`
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

  /// `linear-gradient(170deg,#fef3f9 0%,#f2edfe 46%,#ebe3fd 100%)` —
  /// نفسه دوماً في الوضعين الفاتح والداكن كما في المرجع.
  ///
  /// [STAGE 12] الدرجات الثلاث مشتقّة من ألوان العلامة الجديدة بالطريقة
  /// نفسها التي اشتُقّت بها القديمة: نسبةُ مزج كلِّ درجة فوق الأبيض حُلَّت
  /// من اللون القديم ثم أُعيد تطبيقها على الجديد. التباين محفوظ —
  /// العنوان على الدرجات الثلاث: 16.53 · 15.61 · 14.43:1
  /// (كان 16.48 · 15.41 · 14.26:1). الشاشة تبقى فاتحة وحركتها كما هي.
  static const LinearGradient gradient = LinearGradient(
    colors: [
      Color(0xFFFEF3F9),
      Color(0xFFF2EDFE),
      Color(0xFFEBE3FD),
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
