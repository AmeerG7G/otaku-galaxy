import '../entities/order.dart';
import '../entities/order_data.dart';

/// واجهة مستودع الطلبات (تعريف فقط).
abstract class OrderRepository {
  Future<Order> placeOrder(OrderData data);

  Future<List<Order>> fetchMyOrders();

  Future<Order> fetchOrderDetails(String id);
}
