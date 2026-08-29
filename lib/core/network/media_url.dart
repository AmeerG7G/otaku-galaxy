import '../config/app_config.dart';

/// أصل الوسائط الفعلي — يُضبط مرة عند الإقلاع من نفس عنوان الـAPI.
String _mediaOrigin = _originOf(AppConfig.development.effectiveApiBaseUrl);

String _originOf(String apiBaseUrl) {
  var base = apiBaseUrl.trim();
  while (base.endsWith('/')) {
    base = base.substring(0, base.length - 1);
  }
  return base.endsWith('/api')
      ? base.substring(0, base.length - '/api'.length)
      : base;
}

/// يربط محوّل الوسائط بالبيئة الحالية. يُستدعى من حقن الاعتماديات.
void configureMediaOrigin(AppConfig config) {
  configureMediaOriginFromBaseUrl(config.effectiveApiBaseUrl);
}

/// يربط أصل الوسائط بعنوان الـAPI الفعلي المستعمل.
///
/// [CRITICAL] أصل الوسائط **هو** أصل الـAPI — الملفات يقدّمها الخادم نفسه.
///
/// الفصل بينهما يُنتج عطلاً خبيثاً: الطلبات تنجح والصور وحدها تفشل. حدث
/// ذلك فعلاً حين ضُبط عنوان الـAPI يدوياً (اختبار تكاملي، أو
/// `--dart-define=API_BASE_URL`) بينما بقي أصل الوسائط على قيمة الإقلاع —
/// فصارت الصور تُطلب من `10.0.2.2` بينما الـAPI على `localhost`.
///
/// لذلك يستدعيها [ApiClient] من عنوانه الفعلي، فيستحيل أن يتباعد الاثنان.
void configureMediaOriginFromBaseUrl(String apiBaseUrl) {
  final trimmed = apiBaseUrl.trim();
  if (trimmed.isEmpty) return;
  _mediaOrigin = _originOf(trimmed);
}

/// الأصل المستخدم حالياً في بناء روابط الوسائط (للتشخيص والاختبارات).
String get mediaOrigin => _mediaOrigin;

/// يحوّل مرجع وسائط كما يخزّنه الخادم إلى رابط يمكن للجهاز تحميله.
///
/// الخادم يخزّن مرجعاً **نسبياً** (`/uploads/...`) لأن الأصل المطلق يختلف
/// باختلاف العميل: `localhost` من سطح المكتب، و`10.0.2.2` من محاكي أندرويد،
/// وعنوان الشبكة من هاتف حقيقي. لصق الأصل وقت الرفع كان يجعل صور المسؤول
/// غير قابلة للتحميل على الهاتف — `localhost` هناك هو الهاتف نفسه.
///
/// الروابط الخارجية الكاملة تمرّ كما هي، فبذور الكتالوج وأي صورة على خدمة
/// خارجية تبقى صالحة بلا استثناء خاص.
String? resolveMediaUrl(String? reference) {
  final raw = reference?.trim();
  if (raw == null || raw.isEmpty) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return raw.startsWith('/') ? '$_mediaOrigin$raw' : '$_mediaOrigin/$raw';
}

/// نسخة القوائم — تُسقط المراجع الفارغة بدل تمرير روابط مكسورة للواجهة.
List<String> resolveMediaUrls(Iterable<dynamic>? references) {
  if (references == null) return const [];
  return references
      .map((e) => resolveMediaUrl(e?.toString()))
      .whereType<String>()
      .toList();
}
