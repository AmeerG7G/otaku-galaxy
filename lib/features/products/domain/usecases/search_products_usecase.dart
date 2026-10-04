import '../entities/product_page.dart';
import '../repositories/product_repository.dart';

/// البحث عن المنتجات بالاسم (مع ترقيم صفحات).
class SearchProductsUsecase {
  const SearchProductsUsecase(this._repository);

  final ProductRepository _repository;

  /// `track` ترويسة إشارة البحث النهائي — `null` والقياس مطفأ أو البحث إعادةٌ
  /// بتبديل اللغة لا بحثٌ جديد من المستخدم.
  Future<ProductPage> call(
    String query, {
    int page = 1,
    int limit = 50,
    Map<String, String>? track,
  }) {
    final repository = _repository;
    if (track != null && repository is TrackedProductRepository) {
      return repository.searchProducts(query, page: page, limit: limit, headers: track);
    }
    return repository.searchProducts(query, page: page, limit: limit);
  }
}