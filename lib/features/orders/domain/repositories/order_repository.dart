import '../entities/order.dart';
import '../entities/order_data.dart';

/// واجهة مستودع الطلبات (تعريف فقط).
abstract class OrderRepository {
  Future<Order> placeOrder(OrderData data);

  Future<List<Order>> fetchMyOrders();

  Future<Order> fetchOrderDetails(String id);

  /// الطلب الذي ينتظر تأكيد استلام من العميل، أو `null` إن لم يوجد.
  ///
  /// المرجع هو حالة الطلب على الخادم لا أي علامة محلية، فالسؤال يختفي فور
  /// الإجابة ولا يعود بعد إعادة التثبيت أو الدخول من جهاز آخر.
  Future<Order?> fetchPendingConfirmation();

  /// يؤكّد استلام الطلب — ينقله إلى «تم الاستلام» ويعيد حالته المحدَّثة.
  ///
  /// الخادم هو من يمنح النقاط ويرسل الإشعار؛ التطبيق لا يمنح شيئاً محلياً.
  Future<Order> confirmReceipt(String id);
}
