import '../entities/product.dart';
import '../entities/product_sort.dart';
import '../repositories/product_repository.dart';

/// جلب منتجات قسم محدد.
class FetchCategoryProductsUsecase {
  const FetchCategoryProductsUsecase(this._repository);

  final ProductRepository _repository;

  Future<List<Product>> call(String categoryId, {ProductSort? sort}) =>
      _repository.fetchCategoryProducts(categoryId, sort: sort);
}
