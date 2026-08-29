import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../onboarding/data/onboarding_storage.dart';
import '../../../settings/data/store_settings_repository.dart';

/// شاشة البداية بتصميم Otaku Galaxy v2.
///
/// تركيب مطابق لمصدر التصميم: هالة وردية أعلى الجهة اليمنى الفيزيائية،
/// هالة بنفسجية أسفل الجهة اليسرى، رسمان خافتان في الزاويتين المقابلتين،
/// ثم الشعار داخل هالة بيضاء نابضة، وشريط تحميل مثبّت أسفل الشاشة.
///
/// مواضع الرسوم في المصدر فيزيائية (left/right) ولا تنعكس مع اتجاه النص،
/// لذا: `right` ← `start` و`left` ← `end` في واجهة عربية.
@RoutePage()
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  /// دخول المحتوى: `og-pop` — تلاشٍ مع تكبير من ٠٫٩٢ خلال ٦٠٠ms.
  late final AnimationController _popController;

  /// نبض الهالة البيضاء خلف الشعار: `og-pulse` بدورة ٣ ثوانٍ.
  late final AnimationController _pulseController;

  /// تقدّم شريط التحميل: `og-load` من ٦٪ إلى ١٠٠٪ خلال ٢٫١ ثانية.
  late final AnimationController _loadController;

  late final Animation<double> _popScale;
  late final Animation<double> _popOpacity;

  @override
  void initState() {
    super.initState();

    _popController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 3000),
      vsync: this,
    )..repeat(reverse: true);
    _loadController = AnimationController(
      duration: const Duration(milliseconds: 2100),
      vsync: this,
    );

    _popScale = Tween<double>(begin: 0.92, end: 1).animate(
      CurvedAnimation(parent: _popController, curve: Curves.easeOut),
    );
    _popOpacity = CurvedAnimation(parent: _popController, curve: Curves.easeOut);

    _popController.forward();
    _loadController.forward();

    // إعدادات المتجر عامة — تُحمَّل للزائر والمسجّل على حدٍّ سواء.
    sl<StoreSettingsRepository>().refresh();
    _checkAuthAndNavigate();
  }

  Future<void> _checkAuthAndNavigate() async {
    await Future.delayed(
      const Duration(seconds: AppConstants.splashDurationSeconds + 1),
    );
    if (!mounted) return;
    final auth = context.read<AuthCubit>();
    // استعادة الجلسة من التخزين الآمن والتحقق منها لدى الخادم (/me).
    await auth.loadSession();
    if (!mounted) return;
    // التصفح كزائر مسموح دائماً — الدخول للتطبيق الرئيسي بلا فرض تسجيل
    // دخول؛ الشاشات التي تحتاج حساباً تعرض دعوة تسجيل الدخول عند الحاجة.
    // شاشات التعريف تُعرض مرة واحدة فقط عند أول تشغيل للتطبيق.
    if (sl<OnboardingStorage>().hasSeenOnboarding) {
      context.router.replace(const MainNavigationRoute());
    } else {
      context.router.replace(const OnboardingRoute());
    }
  }

  @override
  void dispose() {
    _popController.dispose();
    _pulseController.dispose();
    _loadController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: isDark
              ? context.themeColors.surfaceGradient
              : const LinearGradient(
                  // ‎170deg في CSS ≈ من الأعلى قليلاً نحو أسفل اليسار.
                  colors: [
                    Color(0xFFFDF3F8),
                    Color(0xFFF2EBFE),
                    Color(0xFFE9E2FB),
                  ],
                  stops: [0, 0.46, 1],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
        ),
        child: Stack(
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
            const PositionedDirectional(
              bottom: -30,
              end: -56,
              child: _FadedArt(asset: 'assets/art/opt/gojo-l.png', width: 250,
                  opacity: 0.17),
            ),
            const PositionedDirectional(
              top: 64,
              start: -38,
              child: _FadedArt(asset: 'assets/art/opt/a-i0.png', width: 132,
                  opacity: 0.15),
            ),

            // الشعار والهوية في مركز الشاشة.
            Center(
              child: FadeTransition(
                opacity: _popOpacity,
                child: ScaleTransition(
                  scale: _popScale,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox.square(
                        dimension: 150,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            // هالة بيضاء نابضة خلف الشعار.
                            FadeTransition(
                              opacity: Tween<double>(
                                begin: 0.35,
                                end: 0.9,
                              ).animate(_pulseController),
                              child: ScaleTransition(
                                scale: Tween<double>(
                                  begin: 0.94,
                                  end: 1.04,
                                ).animate(_pulseController),
                                child: const DecoratedBox(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: RadialGradient(
                                      colors: [
                                        Color(0xF2FFFFFF),
                                        Color(0x00FFFFFF),
                                      ],
                                      stops: [0, 0.7],
                                    ),
                                  ),
                                  child: SizedBox.square(dimension: 150),
                                ),
                              ),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(34),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x424A2C8C),
                                    blurRadius: 44,
                                    offset: Offset(0, 20),
                                  ),
                                ],
                              ),
                              child: const OtakuStoreLogo(
                                size: 124,
                                cornerRadius: 34,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        AppConstants.appName,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontFamily: 'Tajawal',
                          fontSize: 27,
                          fontWeight: AppDimens.weightBlack,
                          letterSpacing: -0.5,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'عالم الأنمي بين يديك',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13,
                          letterSpacing: 0.26,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // شريط التحميل مثبّت أسفل الشاشة كما في مصدر التصميم.
            PositionedDirectional(
              start: 0,
              end: 0,
              bottom: 64,
              child: Column(
                children: [
                  Container(
                    width: 168,
                    height: 5,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: AnimatedBuilder(
                      animation: _loadController,
                      builder: (context, _) => Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: FractionallySizedBox(
                          widthFactor: 0.06 + 0.94 * _loadController.value,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: context.themeColors.primaryGradient,
                              borderRadius: BorderRadius.circular(
                                AppDimens.radiusFull,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'جاري التحميل…',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11.5,
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
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
