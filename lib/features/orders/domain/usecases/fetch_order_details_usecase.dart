import '../entities/order.dart';
import '../repositories/order_repository.dart';

/// جلب تفاصيل طلب محدد.
class FetchOrderDetailsUsecase {
  const FetchOrderDetailsUsecase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(String id) => _repository.fetchOrderDetails(id);
}
