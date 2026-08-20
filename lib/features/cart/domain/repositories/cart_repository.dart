import '../entities/cart_item.dart';

/// واجهة مستودع السلة — جميع العمليات على خادم العميل.
abstract class CartRepository {
  /// جلب عناصر السلة الحالية.
  Future<List<CartItem>> fetchCart();

  /// إضافة منتج/دمج الكمية (يترك الخادم التحقق من المخزون).
  Future<List<CartItem>> addToCart(
    String productId, {
    String? optionValue,
    int quantity = 1,
  });

  /// تحديث كمية سطر معين.
  Future<List<CartItem>> updateQuantity(String lineId, int quantity);

  /// حذف سطر من السلة.
  Future<List<CartItem>> removeFromCart(String lineId);
}