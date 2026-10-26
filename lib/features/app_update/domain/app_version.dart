/// مقارنة النسخ الدلالية (SemVer 2.0.0) — نظير `backend/src/utils/semver.ts`.
///
/// [CRITICAL] المقارنة النصّية خاطئة خطأً صامتاً: `'1.10.0'.compareTo('1.9.0')`
/// سالبٌ لأن `'1' < '9'` حرفياً، فيمرّ مستخدمٌ على نسخة قديمة أو يُحجب
/// مستخدمٌ على أحدث نسخة، بلا أي عرَض يكشفه.
///
/// المنطق مكرَّر بين اللغتين لأن الحاجز نفسه مكرَّر: الواجهة تحجب الشاشة
/// والخادم يرفض الطلب. اختباران متطابقان في الطرفين يحرسان تطابقهما.
class AppVersion implements Comparable<AppVersion> {
  const AppVersion._(this.major, this.minor, this.patch, this.prerelease);

  final int major;
  final int minor;
  final int patch;

  /// معرّفات ما قبل الإصدار (`1.2.0-beta.3` → `['beta', 3]`).
  final List<Object> prerelease;

  static final RegExp _pattern = RegExp(
    r'^(\d{1,9})\.(\d{1,9})\.(\d{1,9})'
    r'(?:-([0-9A-Za-z][0-9A-Za-z.-]*))?'
    r'(?:\+([0-9A-Za-z][0-9A-Za-z.-]*))?$',
  );
  static final RegExp _numeric = RegExp(r'^\d+$');

  /// يحلّل نصّ نسخة، أو `null` إن لم يكن نسخةً دلالية صالحة.
  static AppVersion? tryParse(String? raw) {
    if (raw == null) return null;
    final match = _pattern.firstMatch(raw.trim());
    if (match == null) return null;
    // بيانات البناء (`+1`) تُهمَل: المواصفة تنصّ على أنها لا تدخل في
    // الأسبقية. رقم بناء Flutter في `version: 1.0.0+1` يقع هنا تماماً.
    final pre = match.group(4);
    return AppVersion._(
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3)!),
      pre == null
          ? const []
          : pre
                .split('.')
                .map<Object>((p) => _numeric.hasMatch(p) ? int.parse(p) : p)
                .toList(growable: false),
    );
  }

  @override
  int compareTo(AppVersion other) {
    if (major != other.major) return major.compareTo(other.major);
    if (minor != other.minor) return minor.compareTo(other.minor);
    if (patch != other.patch) return patch.compareTo(other.patch);
    return _comparePrerelease(prerelease, other.prerelease);
  }

  static int _comparePrerelease(List<Object> a, List<Object> b) {
    // النسخة ذات ما قبل الإصدار أدنى من نظيرتها المستقرّة: 1.0.0-rc < 1.0.0.
    if (a.isEmpty && b.isEmpty) return 0;
    if (a.isEmpty) return 1;
    if (b.isEmpty) return -1;

    final shared = a.length < b.length ? a.length : b.length;
    for (var i = 0; i < shared; i += 1) {
      final left = a[i];
      final right = b[i];
      if (left == right) continue;
      // المعرّفات الرقمية أدنى دائماً من النصّية.
      if (left is int && right is int) return left.compareTo(right);
      if (left is int) return -1;
      if (right is int) return 1;
      return '$left'.compareTo('$right');
    }
    return a.length.compareTo(b.length);
  }

  @override
  String toString() {
    final core = '$major.$minor.$patch';
    return prerelease.isEmpty ? core : '$core-${prerelease.join('.')}';
  }
}

/// يقارن نصّين مباشرة، أو `null` إن كان أحدهما غير صالح.
int? compareVersionStrings(String? a, String? b) {
  final left = AppVersion.tryParse(a);
  final right = AppVersion.tryParse(b);
  if (left == null || right == null) return null;
  return left.compareTo(right);
}

/// هل النسخة المثبَّتة أدنى من الحدّ الأدنى المدعوم؟
///
/// [CRITICAL] `false` في كل حالة شكّ — حدٌّ غير مضبوط، أو نسخةٌ غير صالحة.
/// الحجب يُقفل التطبيق كاملاً، فلا يُتّخذ إلا على مقارنةٍ تمّت فعلاً بين
/// قيمتين صالحتين.
bool isUpdateRequired({required String? installed, required String? minimum}) {
  final result = compareVersionStrings(installed, minimum);
  return result != null && result < 0;
}
