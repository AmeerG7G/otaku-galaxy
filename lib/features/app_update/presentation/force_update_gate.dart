import 'dart:async';

import 'package:flutter/material.dart';

import '../data/app_version_repository.dart';
import 'open_store.dart';
import 'screens/force_update_screen.dart';
import 'widgets/optional_update_prompt.dart';

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
/// - **رفضُ الخادم أثناء الاستعمال**: ردّ 426 `APP_UPDATE_REQUIRED` على أي طلب
///   يعيد الفحص فوراً (`AppVersionRepository.serverRejections`).
/// - **بلا شبكة**: فحصٌ لم يصل إلى الخادم يُعاد بمهلٍ متزايدة
///   ([retryDelays]) حتى ينجح — والحكم المعروف (حجبٌ أو لا) يبقى أثناءها.
///   أوّل تشغيلٍ بلا شبكة لا يُحجب: التطبيق لا يعرف بسياسةٍ لم يقرأها.
///
/// [STEP 70] **التحديث الاختياري**: نسخةٌ دون «أحدث إصدار» وليست دون الحدّ
/// ترى `OptionalUpdatePrompt` **فوق** التطبيق — يبقى التطبيق مبنياً حيّاً
/// تحته (لا يُعاد تركيب الرواتر)، والتنبيه يُغلق ولا يعود لذلك الإصدار.
class ForceUpdateGate extends StatefulWidget {
  const ForceUpdateGate({
    super.key,
    required this.child,
    required this.repository,
  });

  final Widget child;
  final AppVersionRepository repository;

  /// مهل إعادة الفحص بعد فشل الشبكة؛ الأخيرة تتكرّر.
  static const retryDelays = <Duration>[
    Duration(seconds: 15),
    Duration(seconds: 30),
    Duration(minutes: 1),
    Duration(minutes: 2),
    Duration(minutes: 5),
  ];

  @override
  State<ForceUpdateGate> createState() => _ForceUpdateGateState();
}

class _ForceUpdateGateState extends State<ForceUpdateGate>
    with WidgetsBindingObserver {
  AppVersionCheck _check = AppVersionCheck.allowed;

  /// يمنع فحصين متوازيين (استئناف أثناء فحص الإقلاع مثلاً).
  bool _checking = false;

  /// رفضٌ وصل أثناء فحصٍ جارٍ. ذلك الفحص ربما قرأ الإعداد قبل رفع الحدّ، فلو
  /// أُسقط الرفض لقال الردّ القديم «مدعومة» ولم يُحجب إلا عند 426 التالي.
  bool _recheckAfterCurrent = false;

  /// إعادة الفحص المجدولة بعد فشل الشبكة، وعدد الإخفاقات المتتالية.
  Timer? _retry;
  int _failures = 0;

  /// التطبيق تحت التنبيه الاختياري: المفتاح يُبقي عنصره نفسه حين يظهر
  /// التنبيه ويختفي، فلا يُعاد بناء الرواتر من الصفر.
  final _childKey = GlobalKey();

  /// إصدارٌ أُغلق تنبيهه في هذه الجلسة (يُحفظ أيضاً، وهذا يخفيه فوراً).
  String? _dismissedNow;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.repository.serverRejections.addListener(_onServerRejection);
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _retry?.cancel();
    widget.repository.serverRejections.removeListener(_onServerRejection);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// الخادم رفض طلباً بسبب النسخة: الفحص يُعاد من الخادم نفسه — لا يُحجب
  /// على الإشارة وحدها، فالإعداد المقروء هو الحكم كما في كل مسار آخر.
  void _onServerRejection() {
    if (_checking) {
      _recheckAfterCurrent = true;
      return;
    }
    unawaited(_refresh());
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
    var reachedServer = false;
    try {
      final result = await widget.repository.check();
      reachedServer = result.fromServer;
      if (mounted) setState(() => _check = result);
    } catch (_) {
      // [CRITICAL] فشلُ الفحص لا يحجب ولا يفكّ حجباً: الحالة تبقى كما هي.
      // انظر سياسة «لا حجب عند الشكّ» في `AppVersionRepository.check`.
    } finally {
      _checking = false;
    }
    if (mounted) _scheduleRetry(reachedServer: reachedServer);
    if (_recheckAfterCurrent && mounted) {
      _recheckAfterCurrent = false;
      await _refresh();
    }
  }

  /// فحصٌ لم يبلغ الخادم ⇒ محاولةٌ بعد مهلةٍ أطول من سابقتها؛ وبلغه ⇒ لا شيء.
  void _scheduleRetry({required bool reachedServer}) {
    if (reachedServer) {
      _failures = 0;
      _retry?.cancel();
      _retry = null;
      return;
    }
    if (_retry?.isActive ?? false) return;
    final delays = ForceUpdateGate.retryDelays;
    final delay = delays[_failures < delays.length ? _failures : delays.length - 1];
    _failures += 1;
    _retry = Timer(delay, () {
      _retry = null;
      unawaited(_refresh());
    });
  }

  bool get _showPrompt {
    final latest = _check.config.latestVersion;
    return _check.updateAvailable &&
        latest.isNotEmpty &&
        _dismissedNow != latest &&
        widget.repository.dismissedPromptVersion() != latest;
  }

  void _dismissPrompt() {
    final latest = _check.config.latestVersion;
    setState(() => _dismissedNow = latest);
    unawaited(widget.repository.dismissPrompt(latest));
  }

  Future<void> _updateFromPrompt(BuildContext context) async {
    final url = _check.config.updateUrl;
    _dismissPrompt();
    await openStoreListing(context, url);
  }

  @override
  Widget build(BuildContext context) {
    if (!_check.updateRequired) {
      // `passthrough`: التطبيق يأخذ القيود نفسها كأن الطبقة غير موجودة.
      return Stack(
        fit: StackFit.passthrough,
        children: [
          KeyedSubtree(key: _childKey, child: widget.child),
          if (_showPrompt)
            Positioned.fill(
              child: OptionalUpdatePrompt(
                installedVersion: _check.installedVersion,
                latestVersion: _check.config.latestVersion,
                onUpdate: () => unawaited(_updateFromPrompt(context)),
                onLater: _dismissPrompt,
              ),
            ),
        ],
      );
    }

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
