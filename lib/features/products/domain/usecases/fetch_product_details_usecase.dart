import '../entities/product.dart';
import '../repositories/product_repository.dart';

/// جلب تفاصيل منتج محدد.
class FetchProductDetailsUsecase {
  const FetchProductDetailsUsecase(this._repository);

  final ProductRepository _repository;

  /// `track` ترويسة إشارة القياس (من `TrackingSignals.headerFor`) — `null`
  /// والقياس مطفأ أو الجلب ليس فتحاً للصفحة (إعادة جلبٍ بتبديل اللغة).
  Future<Product> call(String id, {Map<String, String>? track}) {
    final repository = _repository;
    if (track != null && repository is TrackedProductRepository) {
      return repository.fetchProductDetails(id, headers: track);
    }
    return repository.fetchProductDetails(id);
  }
}
