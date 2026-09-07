import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/order.dart';
import '../../domain/entities/order_data.dart';
import '../../domain/repositories/order_repository.dart';

/// تنفيذ مستودع الطلبات عبر الـ API الحقيقي.
class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<Order> placeOrder(OrderData data) async {
    final orderData =
        await _api.post(ApiEndpoints.orders, body: data.toJson())
            as Map<String, dynamic>;
    return Order.fromJson(orderData);
  }

  @override
  Future<List<Order>> fetchMyOrders() async {
    final data =
        await _api.get(ApiEndpoints.orders, query: {'page': 1, 'limit': 50})
            as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => Order.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<Order> fetchOrderDetails(String id) async {
    final data =
        await _api.get('${ApiEndpoints.orderDetails}$id')
            as Map<String, dynamic>;
    return Order.fromJson(data);
  }

  @override
  Future<Order?> fetchPendingConfirmation() async {
    final data = await _api.get(ApiEndpoints.pendingConfirmation);
    if (data == null) return null;
    return Order.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<Order> confirmReceipt(String id) async {
    final data =
        await _api.post(
              '${ApiEndpoints.orderDetails}$id${ApiEndpoints.confirmReceiptSuffix}',
            )
            as Map<String, dynamic>;
    return Order.fromJson(data);
  }
}
