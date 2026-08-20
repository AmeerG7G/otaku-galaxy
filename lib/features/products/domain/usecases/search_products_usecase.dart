import '../entities/product_page.dart';
import '../repositories/product_repository.dart';

/// البحث عن المنتجات بالاسم (مع ترقيم صفحات).
class SearchProductsUsecase {
  const SearchProductsUsecase(this._repository);

  final ProductRepository _repository;

  Future<ProductPage> call(String query, {int page = 1, int limit = 50}) =>
      _repository.searchProducts(query, page: page, limit: limit);
}