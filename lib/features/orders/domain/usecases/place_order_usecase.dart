import '../entities/order.dart';
import '../entities/order_data.dart';
import '../repositories/order_repository.dart';

/// إرسال طلب جديد. الحالة الأولية: بانتظار تأكيد الإدارة.
class PlaceOrderUsecase {
  const PlaceOrderUsecase(this._repository);

  final OrderRepository _repository;

  Future<Order> call(OrderData data) => _repository.placeOrder(data);
}
