import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme_state.dart';

/// يدير مظهر التطبيق (فاتح/داكن).
///
/// الافتراضي قبل أي اختيار صريح هو المظهر الفاتح. «قبل أي اختيار» تعني
/// غياب القيمة المحفوظة فقط — لا كل إقلاع ولا كل شاشة. متى حفظ المستخدم
/// اختياره صار هو المصدر الوحيد، ولا يُستبدل تلقائياً أبداً.
///
/// مظهر النظام (فاتح/داكن) لا يُقرأ إطلاقاً: قيمة `themeMode` في
/// [MaterialApp] تُشتق من هذه الحالة وحدها، فلا يرث التطبيق تفضيل الجهاز.
///
/// مسجّل كـ singleton لأن المظهر مشترك بين شاشة الإعدادات وجذر التطبيق.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit(this._prefs) : super(const ThemeLight());

  static const String _prefKey = 'theme_mode_dark';

  final SharedPreferences _prefs;

  /// استعادة المظهر المحفوظ.
  ///
  /// تُستدعى مرة واحدة عند الإقلاع (داخل حقن الاعتماديات، قبل `runApp`)
  /// فتُحسم الحالة قبل أول إطار مرسوم — لا وميض بين مظهرين.
  /// غياب القيمة يعني «لا اختيار صريح بعد» فيبقى الفاتح الافتراضي.
  void loadPreference() {
    final saved = _prefs.getBool(_prefKey);
    if (saved == null) return;
    if (saved != isDark) {
      emit(saved ? const ThemeDark() : const ThemeLight());
    }
  }

  /// تعيين المظهر بشكل صريح مع حفظه ليبقى بعد إعادة فتح التطبيق.
  ///
  /// الحفظ يقع دائماً حتى لو طابق الاختيارُ الحالةَ الحالية: أول اختيار على
  /// تثبيت جديد قد يوافق الافتراضي، ويجب أن يُسجَّل كقرار مستخدم لا كصمت.
  void setDark(bool value) {
    _prefs.setBool(_prefKey, value);
    if (isDark != value) {
      emit(value ? const ThemeDark() : const ThemeLight());
    }
  }

  bool get isDark => state.isDark;
}
