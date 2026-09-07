import 'package:shared_preferences/shared_preferences.dart';

/// يتذكّر إن كان العميل اختار لغته ومظهره من قبل.
///
/// شاشة التخصيص تُعرض مرة واحدة بعد أول دخول/تسجيل؛ بعدها يبقى التغيير
/// متاحاً من الإعدادات فقط، فلا نعترض المستخدم في كل تسجيل دخول.
class PersonalizeStorage {
  PersonalizeStorage(this._prefs);

  static const _key = 'has_personalized_v1';

  final SharedPreferences _prefs;

  bool get isDone => _prefs.getBool(_key) ?? false;

  Future<void> markDone() => _prefs.setBool(_key, true);
}
