import 'product.dart';

/// صفحة منتجات من الـ API: عناصر + معلومات الترقيم الصفحي.
class ProductPage {
  const ProductPage({
    required this.items,
    this.page = 1,
    this.limit = 0,
    this.total = 0,
    required this.hasMore,
  });

  final List<Product> items;
  final int page;
  final int limit;
  final int total;

  /// هل توجد صفحات تالية؟
  final bool hasMore;

  factory ProductPage.fromJson(Map<String, dynamic> json) {
    return ProductPage(
      items: (json['items'] as List? ?? const [])
          .map((e) => Product.fromJson(e as Map<String, dynamic>))
          .toList(),
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 0,
      total: json['total'] as int? ?? 0,
      hasMore: json['hasMore'] as bool? ?? false,
    );
  }
}