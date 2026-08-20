import '../entities/order.dart';
import '../repositories/order_repository.dart';

/// جلب قائمة طلبات المستخدم.
class FetchMyOrdersUsecase {
  const FetchMyOrdersUsecase(this._repository);

  final OrderRepository _repository;

  Future<List<Order>> call() => _repository.fetchMyOrders();
}
