import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/media_url.dart';
import '../domain/visual_slot.dart';

/// إعداد الرسوم المُدارة، مقروءاً مرة واحدة لكل جلسة.
///
/// يتبع نمط [StoreSettingsRepository] حرفياً: مفردة كسولة، تُحدَّث عند
/// الإقلاع، تبتلع الفشل، وتُبقي قيمة آمنة. الفرق الوحيد أن الحمولة هنا
/// خريطة «مفتاح موضع ← صورته الفعّالة الآن» بدل روابط تواصل.
///
/// الصورة المؤقّتة (الهجرة ٠٥٥) لا تظهر هنا بوصفها مؤقّتة: الخادم يحسم
/// الفعّالة بساعته ويرسل صورةً واحدة. ما يصل مع الردّ هو `now` (ساعة الخادم)
/// و`nextChangeAt` (أقرب انتهاء مؤقّتة)، فيُجدول [refresh] واحد لتلك اللحظة
/// بالضبط — مهلةٌ محسوبة على ساعة الخادم لا انتظارٌ اعتباطي ولا استطلاع.
///
/// آلة الحالة لكل فتحة — حتميةٌ في كل إطار:
///   • لا إعدادٌ معروف (أول تشغيلٍ على الإطلاق، أو محفوظٌ تالف) ⇒ الأصل المضمَّن.
///   • إعدادٌ معروف (المحفوظ من التشغيل السابق ثم ما يصل من الخادم) ولا
///     صورة للفتحة ⇒ الأصل المضمَّن.
///   • إعدادٌ معروف وللفتحة صورة ⇒ صورة **هذه** الفتحة، بمفتاحها هي؛ لا
///     يُقرأ شيء من فتحة أخرى مهما تشابهت الأصول أو تطابقت الروابط.
///
/// [CRITICAL] لا شيء في التطبيق ينتظر هذه الطبقة. الشاشات ترسم ما تعرفه
/// فوراً، وحين يصل الإعداد تُبدَّل الصور إن تغيّرت. إقلاعٌ يتوقف على نداء
/// شبكة هو إقلاعٌ يفشل مع الشبكة.
///
/// [CRITICAL] «ما تعرفه» يشمل **آخر إعدادٍ وصل في تشغيلٍ سابق**: يُحفظ في
/// `SharedPreferences` ويُستعاد متزامناً في المُنشئ. بدون ذلك كان كل إقلاعٍ
/// يبدأ بلا إعداد، فترسم كل شاشة شخصيتها المضمَّنة كأنها الحقيقة، ثم يصل
/// الإعداد فتُبدَّل الصور كلّها مرةً (إعادة بناء) ومرةً ثانية (بديلُ التحميل
/// حتى تُقرأ الصورة من القرص) — وهذا هو «الوميض» الذي يراه الزبون بعد كل
/// إعادة تشغيل: شخصيةٌ غير التي اختارها المسؤول لثوانٍ، ثم الصحيحة. الخادم
/// يبقى مصدر الحقيقة: المحفوظ هو كلمتُه الأخيرة لا بديلٌ عنها، وأول جلبٍ
/// ناجح يُصحّحه إن تغيّر.
class VisualsRepository {
  VisualsRepository({ApiClient? api, SharedPreferences? prefs})
      : _api = api ?? ApiClient(),
        // المعامل الاسمي لا يجوز أن يكون خاصاً، فلا صيغة `this._prefs`.
        // ignore: prefer_initializing_formals
        _prefs = prefs {
    _restore();
  }

  final ApiClient _api;
  final SharedPreferences? _prefs;

  /// مفتاح آخر إعدادٍ محفوظ — الإصدار والخريطة معاً.
  static const String snapshotKey = 'visual_slots_snapshot';

  Map<String, VisualSlot> _slots = const {};

  /// بصمة آخر إعداد وصل — تُقارَن قبل إعلان تغيير.
  String _version = '';

  /// مراقب دورة حياة التطبيق. يُنشأ مرة واحدة عند أول تحديث.
  AppLifecycleListener? _lifecycle;

  /// آخر لحظة جلب — تمنع نداءً عند كل عودة قصيرة إلى المقدمة.
  DateTime? _lastFetch;

  /// أقل فاصل بين جلبين تلقائيين عند العودة إلى المقدمة.
  static const Duration _resumeThrottle = Duration(minutes: 2);

  /// جلبٌ مجدول للحظة انتهاء أقرب صورة مؤقّتة — واحد في كل وقت.
  Timer? _nextChange;

  /// أطول مهلةٍ لمؤقّتٍ واحد — أقصر بكثير من حدّ `setTimeout` في المتصفح
  /// (٢٣١−١ ملّي ثانية ≈ ٢٤٫٨ يوماً)؛ الأبعد يُقطَّع بجلبٍ وسيط (انظر [_scheduleNextChange]).
  static const Duration _maxTimerDelay = Duration(days: 1);

  /// هل هناك جلبٌ مجدول لانتهاء مؤقّتة؟ — للاختبارات.
  @visibleForTesting
  bool get hasScheduledRefresh => _nextChange?.isActive ?? false;

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
      // الإصدار نفسه الذي استُعيد من التشغيل السابق ⇒ لا تغيير، لا إعادة
      // بناء، لا وميض. الفارغ يُعدّ تغييراً احتياطاً.
      final changed = version.isEmpty || version != _version;
      _slots = parsed;
      _version = version;
      _persist();
      if (changed) revision.value++;
      _scheduleNextChange(
        at: DateTime.tryParse(map['nextChangeAt']?.toString() ?? ''),
        serverNow: DateTime.tryParse(map['now']?.toString() ?? ''),
      );
    } catch (_) {
      // تعذّر الجلب: يبقى آخر إعداد معروف (أو لا شيء)، فتعرض الشاشات
      // أصولها المضمَّنة. لا استثناء يصعد إلى طبقة العرض.
    }
  }

  /// يستعيد آخر إعدادٍ محفوظ — متزامناً، قبل أول إطار. لا يرمي أبداً.
  void _restore() {
    final raw = _prefs?.getString(snapshotKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final parsed = <String, VisualSlot>{};
      for (final entry in (map['slots'] as List? ?? const [])) {
        if (entry is! Map<String, dynamic>) continue;
        final slot = VisualSlot.fromJson(entry);
        if (slot.slotKey.isEmpty || slot.currentUrl.isEmpty) continue;
        parsed[slot.slotKey] = slot;
      }
      _slots = parsed;
      _version = map['version']?.toString() ?? '';
    } catch (_) {
      // محفوظٌ تالف يُهمَل — كأنه لم يكن؛ الجلب التالي يكتب واحداً سليماً.
    }
  }

  /// يحفظ الإعداد الحالي للتشغيل التالي. الفشل يُبتلع — تحسينٌ لا شرط.
  void _persist() {
    final prefs = _prefs;
    if (prefs == null) return;
    final payload = jsonEncode({
      'version': _version,
      'slots': [
        for (final slot in _slots.values)
          {'slotKey': slot.slotKey, 'currentUrl': slot.currentUrl},
      ],
    });
    unawaited(prefs.setString(snapshotKey, payload).catchError((_) => false));
  }

  /// يقرأ صور الإعداد المستعاد من **ذاكرة القرص وحدها** إلى ذاكرة الصور،
  /// كي يُرسم أول إطارٍ للشاشات بالصورة الصحيحة لا ببديل التحميل.
  ///
  /// [CRITICAL] بلا شبكة إطلاقاً: ما ليس على القرص يُترك لمساره العادي
  /// (بديلٌ مضمَّن ثم الصورة حين تصل). محدودٌ بميزانيةٍ كلّية فلا يُطيل
  /// الإقلاع إن تعثّر القرص، ولا يرمي أبداً. صورةٌ في ذاكرة الصور تُعطي
  /// `Image` إطارها في البناء نفسه، فلا يظهر البديل ولو لإطار.
  Future<void> warmRestored({
    Duration budget = const Duration(milliseconds: 1200),
    BaseCacheManager? cacheManager,
  }) async {
    final urls = _slots.values
        .map((slot) => resolveMediaUrl(slot.currentUrl))
        .whereType<String>()
        .toList();
    if (urls.isEmpty) return;
    final manager = cacheManager ?? DefaultCacheManager();
    await Future.wait([
      for (final url in urls)
        () async {
          try {
            final cached = await manager.getFileFromCache(url);
            if (cached == null) return;
            await _warm(url, cacheManager: manager);
          } catch (_) {
            // قرصٌ متعثّر أو ملفٌ تالف: يُترك للمسار العادي.
          }
        }(),
    ]).timeout(budget, onTimeout: () => const []);
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

  /// يجدول جلباً واحداً لحظةَ انتهاء أقرب صورة مؤقّتة.
  ///
  /// [CRITICAL] المهلة تُحسب من ساعة الخادم وحدها (`nextChangeAt - now`
  /// كلاهما منه): ساعة الهاتف قد تتقدّم أو تتأخّر دقائق، والحكم على
  /// الانتهاء عند الخادم. لو أخطأت المهلة رغم ذلك (تعليقٌ طويل للتطبيق
  /// مثلاً) فالردّ يعيد الجدولة بالقيمة الصحيحة: خطأٌ يصحّح نفسه.
  ///
  /// لا مؤقّت بلا مؤقّتةٍ سارية، ولا اثنان معاً: كل ردٍّ يلغي السابق.
  ///
  /// [CRITICAL] المهلة الواحدة لا تتجاوز [_maxTimerDelay]: مؤقّت الويب
  /// (`setTimeout`) يفيض بعد ٢٤٫٨ يوماً فيطلق **فوراً**، والجلب يعيد تسليح
  /// المهلة نفسها فيطلق فوراً — دورانٌ يضرب الخادم حتى يحدّه. انتهاءٌ أبعد
  /// من الحدّ يُجلب مرةً في اليوم فيُقرأ الباقي من ساعة الخادم ويُعاد التسليح
  /// حتى تُدرك اللحظة نفسها بالضبط.
  void _scheduleNextChange({required DateTime? at, required DateTime? serverNow}) {
    _nextChange?.cancel();
    _nextChange = null;
    if (at == null || serverNow == null) return;
    final remaining = at.difference(serverNow);
    if (remaining <= Duration.zero) return;
    final delay = remaining < _maxTimerDelay ? remaining : _maxTimerDelay;
    _nextChange = Timer(delay, () {
      _nextChange = null;
      unawaited(refresh());
    });
  }

  /// يوقف مراقبة دورة الحياة والجلب المجدول — تستدعيه الاختبارات.
  @visibleForTesting
  void dispose() {
    _lifecycle?.dispose();
    _lifecycle = null;
    _nextChange?.cancel();
    _nextChange = null;
  }

  /// يُفرغ الإعداد — يُستدعى عند تبديل البيئة في الاختبارات.
  @visibleForTesting
  void clear() {
    _slots = const {};
    _version = '';
    unawaited(_prefs?.remove(snapshotKey).catchError((_) => false) ?? Future.value());
    revision.value++;
  }

  @visibleForTesting
  // ignore: use_setters_to_change_properties
  void seed(Map<String, VisualSlot> slots) {
    _slots = slots;
    revision.value++;
  }

  /// يُنزّل صورة كل فتحة إلى ذاكرة القرص المؤقتة (وإلى ذاكرة الصور).
  ///
  /// للفتحة صورةٌ فعّالة واحدة (الهجرتان ٠٥٤ و٠٥٥)، فالتنزيل المسبق هو
  /// بالضبط ما ستعرضه الشاشات — لا صورة تُنزَّل ولا تُرى. وهو ما يجعل شاشة
  /// انقطاع الاتصال فتحةً آمنة: صورتها على القرص قبل أن تُحتاج.
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

  /// يحلّ صورة واحدة إلى القرص (وإلى ذاكرة الصور). لا يرمي أبداً.
  Future<void> _warm(String url, {BaseCacheManager? cacheManager}) {
    final completer = Completer<void>();
    final stream = CachedNetworkImageProvider(url, cacheManager: cacheManager)
        .resolve(ImageConfiguration.empty);

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
