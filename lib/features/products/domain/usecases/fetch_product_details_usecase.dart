import '../entities/product.dart';
import '../repositories/product_repository.dart';

/// جلب تفاصيل منتج محدد.
class FetchProductDetailsUsecase {
  const FetchProductDetailsUsecase(this._repository);

  final ProductRepository _repository;

  Future<Product> call(String id) => _repository.fetchProductDetails(id);
}
