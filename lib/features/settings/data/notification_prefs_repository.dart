import '../../../core/network/api_client.dart';
import 'notification_prefs_storage.dart';

/// تفضيلات الإشعارات — **الخادم هو مصدر الحقيقة**.
///
/// كانت التفضيلات تُحفظ في `SharedPreferences` وحدها ولا تُرسَل إلى الخادم
/// أبداً. أثرُ ذلك ليس في المزامنة بين الأجهزة فحسب: الخادم يملك جدولاً
/// لهذه التفضيلات ويقرؤه عند الإرسال، فكان يرسل ما أطفأه المستخدم لأن
/// إطفاءه لم يصل إليه قط. الزرّ كان يبدو مطيعاً وهو لا يفعل شيئاً.
///
/// التخزين المحلي يبقى **ذاكرةً مؤقّتة للعرض الفوري** لا مرجعاً: يُقرأ ليُرسم
/// الزرّ قبل وصول الشبكة، ويُكتب بعد كل ردٍّ ناجح، ولا يُعتدّ به إن خالف
/// الخادم.
class NotificationPrefsRepository {
  NotificationPrefsRepository(this._api, this._cache);

  final ApiClient _api;
  final NotificationPrefsStorage _cache;

  /// آخر ما عُرف محلياً — للرسم الأول بلا انتظار الشبكة.
  Map<NotificationPref, bool> cached() => _cache.readAll();

  /// الحالة كما يراها الخادم الآن.
  Future<Map<NotificationPref, bool>> fetch() async {
    final data = await _api.get('/notifications/prefs');
    return _store(data);
  }

  /// حفظ مفتاح واحد. يعيد الحالة الكاملة كما ردّها الخادم بعد الحفظ.
  ///
  /// الاعتماد على ردّ الخادم لا على القيمة المرسَلة مقصود: لو رفض الخادم
  /// التغيير أو عدّله، فما يُعرض هو ما حُفظ فعلاً لا ما ظنّ التطبيق أنه حُفظ.
  Future<Map<NotificationPref, bool>> setEnabled(
    NotificationPref pref,
    bool enabled,
  ) async {
    final data = await _api.patch(
      '/notifications/prefs',
      body: {'key': pref.key, 'enabled': enabled},
    );
    return _store(data);
  }

  /// يقرأ شكل الردّ `{prefs: {...}}` ويحدّث الذاكرة المؤقّتة.
  Map<NotificationPref, bool> _store(dynamic data) {
    final raw = (data is Map ? data['prefs'] : null);
    final prefs = raw is Map ? raw : const {};
    final result = <NotificationPref, bool>{
      for (final pref in NotificationPref.values)
        // مفتاحٌ لا يعرفه الخادم يعود إلى الافتراضي بدل أن يُرسَم عشوائياً.
        pref: prefs[pref.key] is bool
            ? prefs[pref.key] as bool
            : pref.defaultValue,
    };
    _cache.writeAll(result);
    return result;
  }
}
