import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/media_url.dart';
import '../domain/visual_slot.dart';

/// إعداد الرسوم المُدارة، مقروءاً مرة واحدة لكل جلسة.
///
/// يتبع نمط [StoreSettingsRepository] حرفياً: مفردة كسولة، تُحدَّث عند
/// الإقلاع، تبتلع الفشل، وتُبقي قيمة آمنة. الفرق الوحيد أن الحمولة هنا
/// خريطة فتحات بدل روابط تواصل.
///
/// [CRITICAL] لا شيء في التطبيق ينتظر هذه الطبقة. الشاشات ترسم أصولها
/// المضمَّنة فوراً، وحين يصل الإعداد تُبدَّل الصور. إقلاعٌ يتوقف على نداء
/// شبكة هو إقلاعٌ يفشل مع الشبكة.
class VisualsRepository {
  VisualsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  Map<String, VisualSlot> _slots = const {};

  /// بصمة آخر إعداد وصل — تُقارَن قبل إعلان تغيير.
  String _version = '';

  /// مراقب دورة حياة التطبيق. يُنشأ مرة واحدة عند أول تحديث.
  AppLifecycleListener? _lifecycle;

  /// آخر لحظة جلب — تمنع نداءً عند كل عودة قصيرة إلى المقدمة.
  DateTime? _lastFetch;

  /// أقل فاصل بين جلبين تلقائيين عند العودة إلى المقدمة.
  static const Duration _resumeThrottle = Duration(minutes: 2);

  /// يتغيّر عند وصول إعداد جديد — تستمع إليه [ManagedArtwork] فتُعيد البناء
  /// مرة واحدة بدل استطلاع دوري.
  final ValueNotifier<int> revision = ValueNotifier<int>(0);

  /// الفتحة المطلوبة، أو null إن لم تكن مضبوطة — وعندها يُعرض المضمَّن.
  VisualSlot? slot(String slotKey) => _slots[slotKey];

  /// الرابط المطلق الجاهز للتحميل، أو null.
  String? urlFor(String slotKey) {
    final current = _slots[slotKey]?.currentUrl;
    if (current == null || current.isEmpty) return null;
    return resolveMediaUrl(current);
  }

  /// يجلب الإعداد. لا يرمي أبداً — الفشل يُبقي آخر إعداد معروف.
  ///
  /// [CRITICAL] المراجعة لا تتقدّم إلا إذا تغيّرت البصمة فعلاً. الجلب
  /// الدوري بلا هذا الشرط كان سيُعيد بناء كل رسم في كل شاشة عند كل عودة
  /// إلى المقدمة، ولو لم يتبدّل شيء.
  Future<void> refresh() async {
    _installLifecycleListener();
    try {
      final data = await _api.get(ApiEndpoints.visuals);
      final map = (data as Map<String, dynamic>?) ?? const {};
      final version = map['version']?.toString() ?? '';

      final parsed = <String, VisualSlot>{};
      for (final entry in (map['slots'] as List? ?? const [])) {
        if (entry is! Map<String, dynamic>) continue;
        final slot = VisualSlot.fromJson(entry);
        if (slot.slotKey.isEmpty || slot.currentUrl.isEmpty) continue;
        parsed[slot.slotKey] = slot;
      }

      _lastFetch = DateTime.now();
      final changed = version.isEmpty || version != _version;
      _slots = parsed;
      _version = version;
      if (changed) revision.value++;
    } catch (_) {
      // تعذّر الجلب: يبقى آخر إعداد معروف (أو لا شيء)، فتعرض الشاشات
      // أصولها المضمَّنة. لا استثناء يصعد إلى طبقة العرض.
    }
  }

  /// يعيد الجلب عند عودة التطبيق إلى المقدمة.
  ///
  /// بدون هذا، الإعداد يُقرأ مرة واحدة عند الإقلاع فقط: يبدّل المسؤول
  /// شخصيةً والتطبيق مفتوح على هاتف الزبون، فلا يرى الجديد حتى يُغلق
  /// التطبيق ويُفتح من الصفر — وهو ما لا يفعله أحد عمداً.
  ///
  /// مخنوق بفاصل زمني: العودة من إشعار أو من تبديل تطبيقات لا تستدعي
  /// نداءً في كل مرة.
  void _installLifecycleListener() {
    _lifecycle ??= AppLifecycleListener(
      onResume: () {
        final since = _lastFetch;
        if (since != null && DateTime.now().difference(since) < _resumeThrottle) {
          return;
        }
        unawaited(refresh());
      },
    );
  }

  /// يوقف مراقبة دورة الحياة — تستدعيه الاختبارات.
  @visibleForTesting
  void dispose() {
    _lifecycle?.dispose();
    _lifecycle = null;
  }

  /// يُفرغ الإعداد — يُستدعى عند تبديل البيئة في الاختبارات.
  @visibleForTesting
  void clear() {
    _slots = const {};
    _version = '';
    revision.value++;
  }

  @visibleForTesting
  // ignore: use_setters_to_change_properties
  void seed(Map<String, VisualSlot> slots) {
    _slots = slots;
    revision.value++;
  }

  /// يُنزّل الصور المعروضة الآن إلى ذاكرة القرص المؤقتة.
  ///
  /// **الصور المعروضة فقط، لا كل صور كل فتحة.** فتحةٌ فيها أربع شخصيات
  /// تُعرض منها واحدة اليوم؛ تنزيل الأربع يُهدر بيانات الزبون على ثلاث
  /// صور لن تُرى قبل الغد.
  ///
  /// يمرّ عبر `CachedNetworkImageProvider` نفسه الذي تستعمله الواجهة، فما
  /// يُنزَّل هنا هو بعينه ما تقرؤه الشاشات لاحقاً من القرص — لا مسار تنزيل
  /// ثانٍ ولا ذاكرة مؤقتة موازية.
  Future<void> prefetch() async {
    for (final slot in _slots.values) {
      final url = resolveMediaUrl(slot.currentUrl);
      if (url == null) continue;
      // [CRITICAL] مهلة لكل صورة.
      //
      // `ImageStream` قد لا يستدعي مستمعه إطلاقاً على بعض المنصات (الويب
      // مثلاً، حيث لا ذاكرة قرص أصلاً). بلا مهلة تتوقف الحلقة عند أول
      // صورة إلى الأبد، فلا تُنزَّل ولا واحدة من البقية — وهو تعطّل صامت:
      // لا خطأ، ولا سجل، فقط تخزينٌ مسبق لا يحدث.
      await _warm(url).timeout(
        const Duration(seconds: 8),
        onTimeout: () {},
      );
    }
  }

  /// يحلّ صورة واحدة إلى القرص. لا يرمي أبداً.
  Future<void> _warm(String url) {
    final completer = Completer<void>();
    final stream = CachedNetworkImageProvider(url).resolve(ImageConfiguration.empty);

    late final ImageStreamListener listener;
    void finish() {
      if (completer.isCompleted) return;
      stream.removeListener(listener);
      completer.complete();
    }

    listener = ImageStreamListener(
      (_, _) => finish(),
      // صورة واحدة تعذّر تنزيلها لا توقف البقية ولا تُظهر خطأً: الشاشة
      // ستعرض المضمَّن حين تحين، وهو سلوك صحيح لا فشل.
      onError: (_, _) => finish(),
    );
    stream.addListener(listener);
    return completer.future;
  }
}
