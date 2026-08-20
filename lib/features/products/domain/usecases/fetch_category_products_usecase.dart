import '../entities/product.dart';
import '../repositories/product_repository.dart';

/// جلب منتجات قسم محدد.
class FetchCategoryProductsUsecase {
  const FetchCategoryProductsUsecase(this._repository);

  final ProductRepository _repository;

  Future<List<Product>> call(String categoryId) =>
      _repository.fetchCategoryProducts(categoryId);
}
