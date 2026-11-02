import 'package:shared_preferences/shared_preferences.dart';

/// يتذكر إن كان المستخدم شاهد شاشات التعريف من قبل (تُعرض مرة واحدة فقط).
class OnboardingStorage {
  OnboardingStorage(this._prefs);

  static const _key = 'has_seen_onboarding_v1';

  final SharedPreferences _prefs;

  bool get hasSeenOnboarding => _prefs.getBool(_key) ?? false;

  Future<void> markSeen() => _prefs.setBool(_key, true);
}
