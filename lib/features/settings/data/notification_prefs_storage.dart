import 'package:shared_preferences/shared_preferences.dart';

/// أنواع الإشعارات التي يتحكّم بها العميل من الإعدادات.
///
/// [key] هو المفتاح الذي **يعرفه الخادم** (`user_notification_prefs.key`)،
/// وليس اسماً محلياً. كان مفتاح عيد الميلاد `bday` بينما الخادم يسمّيه
/// `birthday`، فأيّ محاولة لحفظه كانت سترتدّ بخطأ تحقّق — عطلٌ كان مستتراً
/// ما دام التطبيق لا يخاطب الخادم أصلاً.
enum NotificationPref {
  orders('orders', 'prefOrders', true),
  reviews('reviews', 'prefReviews', true),
  stock('stock', 'prefStock', true),
  offers('offers', 'prefOffers', false),
  points('points', 'prefPoints', true),
  birthday('birthday', 'prefBirthday', true);

  const NotificationPref(this.key, this.labelKey, this.defaultValue);

  /// المفتاح المعتمد لدى الخادم — لا يُغيَّر بلا تغيير القيد في القاعدة.
  final String key;
  /// مفتاح `AppStrings` لا نصّ معروض — التعداد ثابتٌ بلا سياق.
  final String labelKey;
  final bool defaultValue;
}

/// ذاكرة مؤقّتة محلية لتفضيلات الإشعارات.
///
/// [CRITICAL] ليست مصدر الحقيقة. المصدر هو الخادم عبر
/// [NotificationPrefsRepository]؛ هذه النسخة تُستعمل لرسم الأزرار فوراً قبل
/// وصول الشبكة، وتُحدَّث بعد كل ردٍّ ناجح. متى اختلفت عن الخادم فالخادم هو
/// الصحيح.
class NotificationPrefsStorage {
  NotificationPrefsStorage(this._prefs);

  /// نسخة ثانية من البادئة: المفاتيح تغيّرت (`bday` → `birthday`) فلا يصحّ
  /// أن تُقرأ قيمٌ قديمة تحت أسماء جديدة.
  static const _prefix = 'notif_pref_v2_';

  final SharedPreferences _prefs;

  bool isEnabled(NotificationPref pref) =>
      _prefs.getBool('$_prefix${pref.key}') ?? pref.defaultValue;

  Map<NotificationPref, bool> readAll() => {
    for (final pref in NotificationPref.values) pref: isEnabled(pref),
  };

  Future<void> setEnabled(NotificationPref pref, bool value) =>
      _prefs.setBool('$_prefix${pref.key}', value);

  /// تحديث الذاكرة المؤقّتة كاملةً بعد ردٍّ ناجح من الخادم.
  Future<void> writeAll(Map<NotificationPref, bool> values) async {
    for (final entry in values.entries) {
      await setEnabled(entry.key, entry.value);
    }
  }
}
