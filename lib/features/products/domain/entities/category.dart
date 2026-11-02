import '../../../../core/network/media_url.dart';

class Category {
  const Category({
    required this.id,
    required this.name,
    this.key = '',
    this.imageUrl,
    this.subcategories = const [],
    this.subcategoryIds = const {},
  });

  final String id;

  /// الاسم **المعروض** — بلغة الواجهة كما حسمها الخادم.
  final String name;

  /// الهوية الثابتة للقسم عبر اللغات والبيئات — الاسم العربي الفريد كما
  /// يرسله الخادم في `key`، وليس نصّاً يُعرض.
  ///
  /// [CRITICAL] الترتيب المعتمد وجدول الألوان يُقفلان على هذه لا على [name].
  /// كانا يُقفلان على الاسم المعروض، فلمّا صار الخادم يرسل الاسم بالكردية
  /// فقدت الأقسام الستة رتبتها ولونها في الواجهة الكردية بلا أي خطأ ظاهر.
  /// فارغةً (ردٌّ قديم بلا `key`) تسقط إلى [name] عبر [stableKey].
  final String key;

  /// [key] أو [name] إن غاب — للردود التي سبقت الحقل.
  String get stableKey => key.isEmpty ? name : key;

  final String? imageUrl;

  /// الأقسام الفرعية داخل هذا القسم (مثال: تيشيرتات/هوديات داخل ملابس).
  final List<String> subcategories;

  /// معرّفات الأقسام الفرعية (الاسم → المعرّف) لفلترة المنتجات
  /// عبر `subcategoryId` الذي يصدّره الخادم في قوائم المنتجات.
  final Map<String, String> subcategoryIds;

  factory Category.fromJson(Map<String, dynamic> json) {
    // الخادم يرسل كائنات { id, name, sortOrder } — نعرض الأسماء للواجهة
    // مع الاحتفاظ بالمعرّفات لربطها بمنتجات القسم الفرعي.
    final raw = json['subcategories'] as List? ?? const [];
    final names = <String>[];
    final ids = <String, String>{};
    for (final e in raw) {
      if (e is Map<String, dynamic>) {
        final name = (e['name'] as String?) ?? e.toString();
        names.add(name);
        final id = e['id']?.toString();
        if (id != null && id.isNotEmpty) ids[name] = id;
      } else {
        names.add(e.toString());
      }
    }
    return Category(
      id: json['id']?.toString() ?? '',
      name: json['name'] as String? ?? '',
      key: json['key'] as String? ?? '',
      imageUrl: resolveMediaUrl(json['imageUrl'] as String?),
      subcategories: names,
      subcategoryIds: ids,
    );
  }
}
