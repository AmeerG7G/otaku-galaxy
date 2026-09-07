import 'dart:async';

import 'package:flutter/material.dart';

import '../data/app_version_repository.dart';
import 'screens/force_update_screen.dart';

/// حاجز إجبار التحديث — يغلّف التطبيق كاملاً فوق الرواتر.
///
/// [CRITICAL] الحجب هنا **يستبدل** الشجرة لا يغطّيها: حين يكون التحديث
/// إجبارياً لا يُبنى الرواتر أصلاً. طبقةٌ فوق رواترٍ حيّ تبقى قابلةً
/// للتجاوز — يكفي مسارٌ عميق أو ضغطةُ رجوعٍ تنقل ما تحتها بينما تظنّ أنك
/// حاجب. أما وقد اختفى الرواتر من الشجرة فليس هناك مسارٌ يُذهَب إليه:
///
/// - **زرّ الرجوع**: `PopScope(canPop: false)` داخل `Navigator` خاص بالحاجز.
/// - **مسار مباشر أو رابط عميق**: لا رواتر مبنيّاً يستقبله.
/// - **وضع الزائر / الدخول والخروج**: الحاجز لا يقرأ حالة المصادقة أصلاً.
/// - **إعادة التشغيل**: الحكم الأخير محفوظ محلياً ويُقرأ قبل أي نداء شبكة.
/// - **العودة من الخلفية**: يُعاد الفحص عند كل استئناف، فرفعُ الحدّ الأدنى
///   يسري على تطبيقٍ مفتوحٍ منذ ساعات.
class ForceUpdateGate extends StatefulWidget {
  const ForceUpdateGate({
    super.key,
    required this.child,
    required this.repository,
  });

  final Widget child;
  final AppVersionRepository repository;

  @override
  State<ForceUpdateGate> createState() => _ForceUpdateGateState();
}

class _ForceUpdateGateState extends State<ForceUpdateGate>
    with WidgetsBindingObserver {
  AppVersionCheck _check = AppVersionCheck.allowed;

  /// يمنع فحصين متوازيين (استئناف أثناء فحص الإقلاع مثلاً).
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  /// الإقلاع: الحكم المحفوظ أولاً ثم الخادم.
  ///
  /// الترتيب مقصود: قراءة القرص فورية، فيظهر الحاجز مع أول إطار بدل أن
  /// يومض المحتوى ثم يُحجب. ولا ينتظر الفحصُ شاشةَ البداية ولا تنتظره —
  /// يجريان معاً فلا يتأخّر الإقلاع بنداء شبكة.
  Future<void> _bootstrap() async {
    final cached = await widget.repository.cachedCheck();
    if (mounted && cached.updateRequired) setState(() => _check = cached);
    await _refresh();
  }

  Future<void> _refresh() async {
    if (_checking) return;
    _checking = true;
    try {
      final result = await widget.repository.check();
      if (mounted) setState(() => _check = result);
    } catch (_) {
      // [CRITICAL] فشلُ الفحص لا يحجب ولا يفكّ حجباً: الحالة تبقى كما هي.
      // انظر سياسة «لا حجب عند الشكّ» في `AppVersionRepository.check`.
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_check.updateRequired) return widget.child;

    // Navigator خاص: `PopScope` لا يُسجَّل بلا Navigator، فتمرّ ضغطةُ الرجوع
    // إلى ما تحت الحاجز. وهذا الـNavigator هو الوحيد في الشجرة الآن.
    return Navigator(
      onGenerateRoute: (settings) => MaterialPageRoute<void>(
        settings: settings,
        builder: (_) => ForceUpdateScreen(
          config: _check.config,
          installedVersion: _check.installedVersion,
        ),
      ),
    );
  }
}
