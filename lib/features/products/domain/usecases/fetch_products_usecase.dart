import '../entities/product_page.dart';
import '../repositories/product_repository.dart';

/// جلب المنتجات مع ترقيم صفحات (لقسم اكتشف المنتجات).
class FetchProductsUsecase {
  const FetchProductsUsecase(this._repository);

  final ProductRepository _repository;

  Future<ProductPage> call({int page = 1, int limit = 20}) =>
      _repository.fetchProducts(page: page, limit: limit);
}