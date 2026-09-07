import 'package:package_info_plus/package_info_plus.dart';

/// مصدر نسخة التطبيق المثبَّتة.
///
/// واجهة لا استدعاءً مباشراً حتى تستطيع الاختبارات تثبيت نسخةٍ بعينها بلا
/// قناة منصّة — ولتبقى نقطةَ الوصل الوحيدة بالمنصّة.
abstract interface class InstalledVersionSource {
  Future<String> version();

  /// آخر نسخة قُرئت، بلا انتظار — فارغة قبل أول قراءة ناجحة.
  ///
  /// يحتاجها معترِض `ApiClient` لأنه متزامن: لا يجوز أن ينتظر كلُّ طلبٍ
  /// قناةَ منصّة. تُملأ مرّة عند الإقلاع ثم تُقرأ بلا كلفة.
  String get cached;
}

/// نسخة ثابتة — للاختبارات ولأي سياق بلا منصّة.
class StaticInstalledVersion implements InstalledVersionSource {
  const StaticInstalledVersion(this._version);

  final String _version;

  @override
  Future<String> version() async => _version;

  @override
  String get cached => _version;
}

/// [CRITICAL] المصدر الوحيد للنسخة هو `version:` في `pubspec.yaml`.
///
/// Gradle يقرؤها إلى `versionName` (`flutter.versionName` في
/// `android/app/build.gradle.kts`) وXcode إلى `Info.plist`، ثم يقرأها
/// `package_info_plus` من المنصّة. فلا يوجد رقم نسخة مكتوب في أي ملف Dart
/// يمكن أن يتخلّف عن الحقيقي — وهو ما كان سيجعل التطبيق يعلن نسخةً غير
/// التي يشغّلها المستخدم فعلاً.
class PackageInfoVersion implements InstalledVersionSource {
  PackageInfoVersion();

  String? _cachedVersion;

  @override
  String get cached => _cachedVersion ?? '';

  @override
  Future<String> version() async {
    final cached = _cachedVersion;
    if (cached != null) return cached;
    final info = await PackageInfo.fromPlatform();
    return _cachedVersion = normalizeInstalledVersion(info.version);
  }
}

/// لواحق النكهات التي يضيفها Gradle — `versionNameSuffix` في
/// `android/app/build.gradle.kts` (`create("dev")` و`create("staging")`).
const _flavorSuffixes = ['-dev', '-staging'];

/// يزيل لاحقة النكهة من النسخة المعلَنة.
///
/// [CRITICAL] بلا هذا يصير بناء التطوير `1.0.0-dev`، وهو بقواعد SemVer
/// **أدنى** من `1.0.0` (ما قبل الإصدار أدنى من نظيره المستقرّ) — فيُحجب كل
/// بناء تطوير واختبار في اللحظة التي يُضبط فيها حدٌّ أدنى يساوي نسخته.
/// اللاحقة هنا اسمُ قناةٍ يضيفه Gradle، لا إصدارٌ تمهيدي يديره الفريق؛
/// نسخة التطبيق الحقيقية هي `version:` في `pubspec.yaml` وحدها. أما
/// المعرّفات التمهيدية الحقيقية (`-beta.1`) فتبقى كما هي وتُقارَن بقواعدها.
String normalizeInstalledVersion(String raw) {
  var version = raw.trim();
  for (final suffix in _flavorSuffixes) {
    if (version.endsWith(suffix)) {
      return version.substring(0, version.length - suffix.length);
    }
  }
  return version;
}
