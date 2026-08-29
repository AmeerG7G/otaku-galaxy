import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// اللغات المدعومة في التطبيق.
enum AppLanguage {
  arabic('ar', 'العربية'),
  // المرجع البصري يكتب الاسم بحروف عربية «كوردي» (وخط Tajawal لا يملك
  // الحرف الفارسي ک أصلاً فيظهر مربّعاً). الوصف يبقى بالكردية.
  kurdish('ckb', 'كوردي');

  const AppLanguage(this.code, this.label);

  final String code;
  final String label;

  Locale get locale => Locale(code);

  static AppLanguage fromCode(String? code) {
    for (final lang in AppLanguage.values) {
      if (lang.code == code) return lang;
    }
    return AppLanguage.arabic;
  }
}

/// يدير لغة الواجهة ويحفظ اختيار المستخدم.
///
/// العربية والكردية كلتاهما لغتان تُكتبان من اليمين لليسار، فاتجاه الواجهة
/// لا يتغيّر بينهما.
class LocaleCubit extends Cubit<AppLanguage> {
  LocaleCubit(this._prefs) : super(AppLanguage.arabic);

  static const String _prefKey = 'app_language_code';

  final SharedPreferences _prefs;

  void loadPreference() {
    final saved = _prefs.getString(_prefKey);
    if (saved != null) emit(AppLanguage.fromCode(saved));
  }

  Future<void> setLanguage(AppLanguage language) async {
    if (state == language) return;
    emit(language);
    await _prefs.setString(_prefKey, language.code);
  }
}
