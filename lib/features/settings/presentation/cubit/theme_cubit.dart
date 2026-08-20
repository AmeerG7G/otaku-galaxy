import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme_state.dart';

/// يدير مظهر التطبيق (فاتح/داكن).
///
/// الافتراضي للمستخدمين الجدد هو المظهر الداكن، واختيار المستخدم
/// (فاتح/داكن) يُحفظ محلياً ويُستعاد عند إعادة فتح التطبيق.
///
/// مسجّل كـ singleton لأن المظهر مشترك بين شاشة الإعدادات وجذر التطبيق.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit(this._prefs) : super(const ThemeDark());

  static const String _prefKey = 'theme_mode_dark';

  final SharedPreferences _prefs;

  /// استعادة المظهر المحفوظ (إن وُجد)؛ إن لم يُحفظ شيء يبقى الداكن الافتراضي.
  void loadPreference() {
    final saved = _prefs.getBool(_prefKey);
    if (saved != null && saved != isDark) {
      emit(saved ? const ThemeDark() : const ThemeLight());
    }
  }

  /// تعيين المظهر بشكل مباشر مع حفظه ليبقى بعد إعادة فتح التطبيق.
  void setDark(bool value) {
    if (isDark != value) {
      emit(value ? const ThemeDark() : const ThemeLight());
      _prefs.setBool(_prefKey, value);
    }
  }

  bool get isDark => state.isDark;
}
