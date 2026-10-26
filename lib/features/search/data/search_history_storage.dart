import 'package:shared_preferences/shared_preferences.dart';

/// سجلّ آخر عمليات البحث — محلي على الجهاز عمداً.
///
/// لا يُخزَّن على الخادم: هو تفضيل جهاز لا بيانات حساب، ولا معنى لمزامنته
/// أو لإنشاء جدول له. يتبع نفس نمط [PersonalizeStorage] بمفتاح مُصدَّر.
class SearchHistoryStorage {
  SearchHistoryStorage(this._prefs);

  static const _key = 'recent_searches_v1';

  /// أقصى عدد مصطلحات محفوظة (نفس ما تعرضه الشاشة).
  static const maxTerms = 6;

  final SharedPreferences _prefs;

  List<String> load() => _prefs.getStringList(_key) ?? const [];

  /// يضيف مصطلحاً للمقدّمة بلا تكرار، ويعيد القائمة بعد التحديث.
  Future<List<String>> add(String term) async {
    final trimmed = term.trim();
    if (trimmed.isEmpty) return load();

    final terms = [...load()]
      ..removeWhere((existing) => existing == trimmed)
      ..insert(0, trimmed);
    if (terms.length > maxTerms) terms.removeRange(maxTerms, terms.length);

    await _prefs.setStringList(_key, terms);
    return terms;
  }

  Future<void> clear() => _prefs.remove(_key);
}
