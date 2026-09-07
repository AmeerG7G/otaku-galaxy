import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/di/injection_container.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../onboarding/data/onboarding_storage.dart';
import '../../../settings/data/store_settings_repository.dart';
import '../../../visuals/data/visuals_repository.dart';
import '../widgets/splash_animations.dart';
import '../widgets/splash_backdrop.dart';
import '../widgets/splash_brand.dart';
import '../widgets/splash_loader.dart';

/// شاشة البداية — إعادة بناء مطابقة ١:١ لمرجع التصميم `Otaku Galaxy v2.dc.html`.
///
/// التركيب (كلُّه من المرجع):
/// - خلفية متدرّجة ثابتة فاتحة تعمل بالهوية نفسها في الوضعين الفاتح والداكن
///   (+ هالتان لونيتان ورسمان خافتان).
/// - الشعار داخل هالة نابضة ثم الاسم والشعار النصّي، بدخول `og-pop`.
/// - شريط تحميل مثبّت أسفل الشاشة يتعبّد بـ `og-load`.
///
/// الحالة: تعرِض الشاشة مدة `armSplash` (٢٫٣ ث في المرجع)، خلالها تُحمَّل
/// إعدادات المتجر ورسوم الشخصيات، ثم تُستعاد جلسة المصادقة ويتقرّر التنقل
/// لنفس المنطق السابق (تعريف مرة واحدة مقابل التطبيق الرئيسي) دون تغييره.
@RoutePage()
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  /// دخول المحتوى: `og-pop .6s ease` — تلاشٍ مع تكبير من ٠٫٩٢.
  late final AnimationController _popController;

/// نبض الهالة البيضاء خلف الشعار: `og-pulse 3s ease-in-out infinite`
    /// (دورة كاملة ٣ ثوانٍ؛ `repeat(reverse:true)` يضاعف المدة فتمرَّر
    /// ١·٥ ث = نصف الدورة).
    late final AnimationController _pulseController;

  /// تقدّم شريط التحميل: `og-load 2.1s ease` من ٦٪ إلى ١٠٠٪.
  late final AnimationController _loadController;

  late final Animation<double> _popOpacity;
  late final Animation<double> _popScale;
  late final Animation<double> _pulseOpacity;
  late final Animation<double> _pulseScale;
  late final Animation<double> _loadCurved;

  @override
  void initState() {
    super.initState();

    _popController = AnimationController(
      duration: SplashTiming.pop,
      vsync: this,
    );
    _pulseController = AnimationController(
      // نصف الدورة عمداً: `repeat(reverse:true)` يصنع دورة كاملة من ضعف
      // المدة — ٢×١٫٥ = ٣ ثوانٍ موازية لـ `og-pulse 3s` (قمة عند ١٫٥ ث).
      duration: SplashTiming.pulseHalf,
      vsync: this,
    )..repeat(reverse: true);
    _loadController = AnimationController(
      duration: SplashTiming.load,
      vsync: this,
    );

    // `og-pop .6s ease` — نفس منحنى `ease` في CSS.
    final pop = CurvedAnimation(
      parent: _popController,
      curve: SplashTiming.popCurve,
    );
    _popOpacity = pop;
    _popScale = Tween<double>(begin: 0.92, end: 1).animate(pop);

    // `og-pulse 3s ease-in-out infinite` — نفس منحنى `ease-in-out` في CSS.
    final pulse = CurvedAnimation(
      parent: _pulseController,
      curve: SplashTiming.pulseCurve,
    );
    _pulseOpacity = Tween<double>(begin: 0.35, end: 0.9).animate(pulse);
    _pulseScale = Tween<double>(begin: 0.94, end: 1.04).animate(pulse);

    // `og-load 2.1s ease forwards` — منحنى `ease` نفسه.
    _loadCurved = CurvedAnimation(
      parent: _loadController,
      curve: SplashTiming.loadCurve,
    );

    _popController.forward();
    _loadController.forward();

    // إعدادات المتجر عامة — تُحمَّل للزائر والمسجّل على حدٍّ سواء.
    sl<StoreSettingsRepository>().refresh();

    // رسوم الشخصيات المُدارة. **لا يُنتظر** عمداً: الشاشات ترسم أصولها
    // المضمَّنة فوراً، وحين يصل الإعداد تُبدَّل الصور من تلقائها. إقلاعٌ
    // يتوقف على نداء شبكة هو إقلاعٌ يفشل مع الشبكة.
    unawaited(_loadManagedVisuals());

    // يُضيء عدّاد مدة العرض (مطابقاً لـ `armSplash` في المرجع) ومسار
    // المصادقة معاً؛ التنقل يتم حين تتحقق متطلبات الإقلاع.
    unawaited(_checkAuthAndNavigate());
  }

  /// يجلب الإعداد ثم ينزّل الصور المعروضة إلى ذاكرة القرص المؤقتة.
  ///
  /// التنزيل بعد الجلب لا معه: الجلب وحده يكفي لعرض الصور، والتنزيل المسبق
  /// تحسينٌ للإقلاع التالي فلا يجوز أن يؤخّر هذا الإقلاع.
  Future<void> _loadManagedVisuals() async {
    final visuals = sl<VisualsRepository>();
    await visuals.refresh();
    await visuals.prefetch();
  }

  Future<void> _checkAuthAndNavigate() async {
    final auth = context.read<AuthCubit>();
    // ننتظر بالتوازي: مدة العرض الدنيا المطابقة للمرجع (٢٫٣ ث) واستعادة
    // الجلسة — التنقل حين يحصل أبطأهما، فلا نقصّر الشاشة ولا نتفوّت
    // استعادة الجلسة.
    await Future.wait([
      Future.delayed(SplashTiming.referenceTransitionDelay),
      auth.loadSession(),
    ]);
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
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const SplashBackdrop(),
          // الشعار والهوية في مركز الشاشة.
          Center(
            child: SplashBrand(
              popOpacity: _popOpacity,
              popScale: _popScale,
              pulseOpacity: _pulseOpacity,
              pulseScale: _pulseScale,
            ),
          ),
          // شريط التحميل مثبّت أسفل الشاشة كما في مصدر التصميم.
          SplashLoader(loadFill: _loadCurved),
        ],
      ),
    );
  }
}
