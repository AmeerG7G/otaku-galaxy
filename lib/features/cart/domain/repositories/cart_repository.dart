import '../entities/cart_item.dart';
import '../entities/cart_sync.dart';

/// واجهة مستودع السلة — جميع العمليات على خادم العميل.
abstract class CartRepository {
  /// جلب عناصر السلة الحالية.
  Future<List<CartItem>> fetchCart();

  /// مزامنة السلة مع الخادم (CA-14): الأسطر بأسعارها الحالية، وما عدّله
  /// الخادم ليبقيها صالحة (إزالة غير المتوفر، خفض ما يتجاوز المخزون).
  Future<CartSnapshot> syncCart();

  /// إضافة منتج/دمج الكمية (يترك الخادم التحقق من المخزون).
  ///
  /// [variantId] لون المنتج (STEP 74) — إلزاميٌّ لمنتجٍ بألوان (الخادم يرفض
  /// غيابه بـ`VARIANT_REQUIRED`)، و`null` لمنتجٍ بلا ألوان.
  Future<List<CartItem>> addToCart(
    String productId, {
    String? optionValue,
    String? variantId,
    int quantity = 1,
  });

  /// تحديث كمية سطر معين.
  Future<List<CartItem>> updateQuantity(String lineId, int quantity);

  /// حذف سطر من السلة.
  Future<List<CartItem>> removeFromCart(String lineId);
}