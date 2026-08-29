import '../../../../core/network/media_url.dart';

class Category {
  const Category({
    required this.id,
    required this.name,
    this.imageUrl,
    this.subcategories = const [],
    this.subcategoryIds = const {},
  });

  final String id;
  final String name;
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
      imageUrl: resolveMediaUrl(json['imageUrl'] as String?),
      subcategories: names,
      subcategoryIds: ids,
    );
  }
}
