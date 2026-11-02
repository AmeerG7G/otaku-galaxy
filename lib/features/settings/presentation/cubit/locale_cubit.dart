import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// اللغات المدعومة في التطبيق.
enum AppLanguage {
  arabic('ar', 'العربية', 'العربية'),
  // المرجع البصري يكتب الاسم بحروف عربية «كوردي» (وخط Tajawal لا يملك
  // الحرف الفارسي ک أصلاً فيظهر مربّعاً). الوصف يبقى بالكردية.
  kurdish('ckb', 'كوردي', 'زمانی کوردی');

  const AppLanguage(this.code, this.label, this.nativeName);

  final String code;

  /// اسم اللغة كما يُعرض في المُنتقي.
  ///
  /// [CRITICAL] ليس نصَّ واجهة ولا يدخل `AppStrings`. اسم اللغة لا يُترجَم:
  /// «العربية» تبقى «العربية» في واجهةٍ كردية، وإلّا عجز من لا يقرأ لغة
  /// الواجهة الحالية عن إيجاد لغته — وهو بالضبط من يحتاج المُنتقي.
  final String label;

  /// الاسم بحروف اللغة نفسها (endonym).
  ///
  /// مفصولٌ عن [label] لأن الكردية تُعرض باسمين: «كوردي» بحروف عربية
  /// ليقرأه زبونٌ عربي، و«زمانی کوردی» بحروفها ليعرفه صاحبها. كان الثاني
  /// نصّاً حرفياً في `personalize_screen.dart`، فبدا نصَّ واجهةٍ مهملاً؛
  /// موضعه هنا يقول ما هو.
  final String nativeName;

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

  /// يُستدعى بعد كل تبديلٍ فعلي للغة — يربطه `injection_container` بمزامنة
  /// `AuthCubit` مع الخادم. مفصولٌ هكذا حتى لا يعرف مكعّب اللغة شيئاً عن
  /// الجلسة؛ و`null` في الاختبارات التي لا تعنيها المزامنة.
  Future<void> Function(AppLanguage language)? onLanguageChanged;

  void loadPreference() {
    final saved = _prefs.getString(_prefKey);
    if (saved != null) emit(AppLanguage.fromCode(saved));
  }

  Future<void> setLanguage(AppLanguage language) async {
    if (state == language) return;
    emit(language);
    await _prefs.setString(_prefKey, language.code);
    await onLanguageChanged?.call(language);
  }
}
