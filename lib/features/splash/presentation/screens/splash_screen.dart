import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../onboarding/data/onboarding_storage.dart';
import '../../../settings/data/store_settings_repository.dart';
import '../../domain/startup_progress.dart';
import '../widgets/splash_animations.dart';
import '../widgets/splash_backdrop.dart';
import '../widgets/splash_brand.dart';
import '../widgets/splash_loader.dart';

/// شاشة البداية — إعادة بناء مطابقة ١:١ لمرجع التصميم `Otaku Galaxy v2.dc.html`.
///
/// التركيب (كلُّه من المرجع):
/// - خلفية متدرّجة ثابتة فاتحة تعمل بالهوية نفسها في الوضعين الفاتح والداكن
///   (+ هالتان لونيتان ورسمٌ خافت).
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

  /// تقدّم شريط التحميل — **يتبع** [_startup] ولا يمثّل زمناً.
  ///
  /// [CRITICAL] كان هذا مؤقّتاً مدته ٢٫٣ث يعمل مستقلاً عن الإقلاع، والانتقال
  /// مؤقّتاً ثانياً. المؤقّت الثاني يبدأ عند `initState` بينما هذا لا يبدأ
  /// إلا مع أول إطار، فأيّ تأخّرٍ في أول إطار يجعل الانتقال يسبق امتلاء
  /// الشريط — وهو العطب المُبلَّغ عنه بالضبط. الآن مدته مدة **تنعيم** بين
  /// قيمتين حقيقيتين لا مدة الإقلاع.
  late final AnimationController _loadController;

  /// المصدر الوحيد للتقدّم وقرار الانتقال.
  final StartupProgress _startup = StartupProgress();

  /// يمنع تنفيذ الانتقال مرتين إن بلغت الحركة نهايتها أكثر من مرة.
  bool _navigated = false;

  late final Animation<double> _popOpacity;
  late final Animation<double> _popScale;
  late final Animation<double> _pulseOpacity;
  late final Animation<double> _pulseScale;

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
      // مدة الانتقال بين قيمتَي تقدّم متجاورتين — لا مدة الإقلاع.
      duration: SplashTiming.progressEase,
      vsync: this,
    );
    // [CRITICAL] شرط الانتقال الوحيد: الشريط بلغ نهايته **و** كل الخطوات
    // المطلوبة تمّت. لا مؤقّت ثانٍ يقرّر شيئاً.
    _loadController.addStatusListener(_onLoadStatus);
    _startup.addListener(_onStartupChanged);

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


    _popController.forward();

    // إعدادات المتجر عامة — تُحمَّل للزائر والمسجّل على حدٍّ سواء.
    sl<StoreSettingsRepository>().refresh();

    unawaited(_runStartup());
  }

  /// يشغّل خطوات الإقلاع المطلوبة، كلٌّ تُعلن تمامها بنفسها.
  Future<void> _runStartup() async {
    // ١) التفضيلات: `SharedPreferences` حُمِّلت في حقن الاعتماديات قبل
    //    `runApp`، وقراءتها متزامنة. الخطوة معلَنة لأن قرار التوجيه يعتمد
    //    عليها، فيبقى الشرط ظاهراً في النموذج لا مضمراً في ترتيب الأسطر.
    _startup.complete(StartupStep.preferences);

    // ٢) لحظة الهوية: مدة العرض الدنيا من مرجع التصميم.
    unawaited(
      Future<void>.delayed(SplashTiming.referenceTransitionDelay).then((_) {
        if (mounted) _startup.complete(StartupStep.brandMoment);
      }),
    );

    // ٣) استعادة الجلسة — العمل الوحيد المجهول المدة.
    try {
      await context.read<AuthCubit>().loadSession();
      if (!mounted) return;
      _startup.complete(StartupStep.session);
    } catch (error) {
      // [CRITICAL] لا انتقال إلى تطبيقٍ نصفِ مُهيَّأ، ولا ١٠٠٪ كاذبة.
      if (mounted) _startup.fail(error);
    }
  }

  void _onStartupChanged() {
    if (!mounted) return;
    if (_startup.hasFailed) {
      setState(() {});
      return;
    }
    // الشريط يلاحق القيمة الحقيقية؛ الهدف لا يُخترع أبداً.
    _loadController.animateTo(_startup.progress);
  }

  void _onLoadStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    if (!_startup.isComplete) return;
    _navigate();
  }

  /// إعادة المحاولة تُعيد **كل** الخطوات المطلوبة، لا استعادة الجلسة وحدها.
  ///
  /// [CRITICAL] `reset()` يمسح كل الخطوات، و`_runStartup` يسجّلها كلها من
  /// جديد — لا خطوةَ تُسجَّل مرةً واحدة من `initState` فيبقى الشريط عالقاً.
  Future<void> _retry() async {
    _startup.reset();
    _loadController.value = 0;
    setState(() {});
    await _runStartup();
  }

  /// الانتقال — لا يقع إلا من [_onLoadStatus]، أي بعد بلوغ الشريط نهايته
  /// **و** تمام كل الخطوات المطلوبة معاً. شرطٌ واحد لا شرطان متسابقان.
  void _navigate() {
    if (_navigated || !mounted) return;
    _navigated = true;
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
    _startup.removeListener(_onStartupChanged);
    _startup.dispose();
    _loadController.removeStatusListener(_onLoadStatus);
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
          // شريط التحميل مثبّت أسفل الشاشة كما في مصدر التصميم — أو حالة
          // العطب مكانه.
          //
          // [CRITICAL] العطب لا يُخفى ولا يُكمَل عليه: الشريط يبقى عند آخر
          // قيمة حقيقية بلغها، ولا انتقال إلى تطبيقٍ نصفِ مُهيَّأ.
          if (_startup.hasFailed)
            _SplashFailure(onRetry: _retry)
          else
            SplashLoader(loadFill: _loadController),
        ],
      ),
    );
  }
}


/// حالة تعذّر الإقلاع — رسالة وزرّ إعادة محاولة مكان شريط التحميل.
class _SplashFailure extends StatelessWidget {
  const _SplashFailure({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return PositionedDirectional(
      start: 24,
      end: 24,
      bottom: 64,
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.strings('startupFailed'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                height: 1.6,
                fontWeight: AppDimens.weightBold,
                color: context.themeColors.errorText,
              ),
            ),
            const SizedBox(height: 12),
            AnimeOutlinedButton(
              label: context.strings('retry'),
              onPressed: onRetry,
              expanded: false,
            ),
          ],
        ),
      ),
    );
  }
}
