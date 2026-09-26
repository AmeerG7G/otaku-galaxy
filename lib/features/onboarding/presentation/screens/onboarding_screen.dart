import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/router/app_router.dart';
import '../../../settings/data/personalize_storage.dart';
import '../../data/onboarding_storage.dart';
import '../widgets/onboarding_slides.dart';

/// مفاتيحُ لا نصوص: القائمة ثابتة على مستوى الملف فلا سياق لها.
const _ctaKeys = ['ctaLetsStart', 'ctaContinue', 'startShopping'];

/// غسلة لونية خلف كل شريحة — مركزها ولونها من `ob.wash` في مصدر التصميم.
const _washes = [
  _Wash(Alignment(0.76, -0.88), AppColors.secondary, 0.16),
  _Wash(Alignment(0, -0.52), AppColors.primary, 0.15),
  _Wash(Alignment(-0.8, 0.64), AppColors.accentCyan, 0.17),
];

class _Wash {
  const _Wash(this.center, this.color, this.alpha);

  final Alignment center;
  final Color color;
  final double alpha;
}

/// شاشات التعريف — تُعرض مرة واحدة عند أول تشغيل ([OnboardingStorage]).
///
/// محلّية بالكامل: لا شبكة ولا خادم، فلا حالات تحميل/خطأ/فراغ لها. حاجز
/// الاتصال العام يغطّي انقطاع الشبكة قبل الوصول إلى هذه الشاشة.
///
/// كل شريحة تركيبة مستقلة (لا قالب واحد بمعاملات): المصدر يضع النص أسفل
/// الشريحة الأولى وأعلى الشريحتين التاليتين، ولكلٍّ عناصرها الطافية الخاصة.
@RoutePage()
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  /// يمنع نقرتين متتاليتين من تنفيذ الإنهاء/التنقّل مرتين.
  bool _finishing = false;

  static const _slideCount = 3;

  bool get _isLast => _index >= _slideCount - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// إنهاء التعريف — ثم اختيار اللغة والمظهر مرة واحدة قبل المتجر.
  ///
  /// [CRITICAL] الزائر يرى شاشة التخصيص (العربية / كوردي) هنا لا في شاشة
  /// الدخول وحدها: كانت هذه الدالة تدخل المتجر مباشرةً، فلا يقع اختيار
  /// اللغة إلا على من فتح «تسجيل الدخول» ثم «تصفّح كزائر». نفس القاعدة التي
  /// تطبّقها شاشة الدخول: مرة واحدة (`PersonalizeStorage`)، ثم الإعدادات.
  Future<void> _finish() async {
    if (_finishing) return;
    _finishing = true;
    await sl<OnboardingStorage>().markSeen();
    if (!mounted) return;
    await context.router.replace(
      sl<PersonalizeStorage>().isDone
          ? const MainNavigationRoute()
          : const PersonalizeRoute(),
    );
  }

  void _next() {
    if (_isLast) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: AppDimens.durationNormal,
      curve: AppDimens.curveEmphasized,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final wash = _washes[_index];

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: Stack(
        children: [
          // غسلة لونية خلف كل المحتوى، تتبدّل مع الشريحة الحالية.
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedSwitcher(
                duration: AppDimens.durationNormal,
                child: DecoratedBox(
                  key: ValueKey(_index),
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      center: wash.center,
                      radius: 1.2,
                      colors: [
                        wash.color.withValues(alpha: wash.alpha),
                        wash.color.withValues(alpha: 0),
                      ],
                      stops: const [0, 0.62],
                    ),
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(theme),
                Expanded(
                  child: PageView(
                    controller: _controller,
                    onPageChanged: (i) => setState(() => _index = i),
                    children: const [
                      OnboardingSlideOne(),
                      OnboardingSlideTwo(),
                      OnboardingSlideThree(),
                    ],
                  ),
                ),
                _buildFooter(theme),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// ترويسة الهوية: الشعار ثم اسم المتجر في جهة البداية.
  Widget _buildHeader(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 0),
      child: Row(
        children: [
          const OtakuStoreLogoSimple(size: 36),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              context.strings('brandName'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall?.copyWith(
                fontFamily: 'Tajawal',
                fontSize: 14.5,
                fontWeight: AppDimens.weightExtraBold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// المؤشّرات ثم الإجراء الرئيسي الوحيد. الشريحة الأخيرة فيها زر
  /// «ابدأ التسوق» فقط يدخل المتجر مباشرة (تصفّح كزائر) — بلا رابط
  /// «لدي حساب»: تسجيل الدخول من شاشة الدخول عند الحاجة.
  Widget _buildFooter(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 6, 24, 30),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // المؤشّرات تبدأ من جهة البداية (يمين الشاشة) كما في المصدر.
          Row(
            children: [
              for (var i = 0; i < _slideCount; i++) ...[
                if (i > 0) const SizedBox(width: 7),
                AnimatedContainer(
                  duration: AppDimens.durationFast,
                  width: i == _index ? 28 : 8,
                  height: 5,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(3),
                    color: i == _index
                        ? AppColors.secondary
                        : theme.colorScheme.outlineVariant,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          AnimePrimaryButton(
            label: context.strings(_ctaKeys[_index]),
            onPressed: _next,
            height: AppDimens.buttonHeightXl,
            borderRadius: AppDimens.radiusMd,
            // المصدر: linear-gradient(135deg, pink, violet) — وردي على
            // اليسار الفيزيائي وبنفسجي على اليمين. رمز التطبيق العام
            // معكوس عن هذا، فنمرّر الاتجاه الصحيح لهذه الشاشة.
            gradient: AppColors.ctaGradient,
          ),
        ],
      ),
    );
  }
}
