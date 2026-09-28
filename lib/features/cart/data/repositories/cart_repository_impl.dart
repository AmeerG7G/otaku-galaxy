import '../../../../core/l10n/bilingual_text.dart';
import '../../../../core/network/media_url.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../../products/domain/entities/product.dart';
import '../../domain/entities/cart_item.dart';
import '../../domain/entities/cart_sync.dart';
import '../../domain/repositories/cart_repository.dart';

/// تنفيذ مستودع السلة عبر الـ API الحقيقي.
///
/// خرط خطوط الخادم إلى [CartItem] مع الحفاظ على [CartItem.lineId]
/// لعمليات التحديث والحذف اللاحقة.
class CartRepositoryImpl implements CartRepository {
  CartRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<List<CartItem>> fetchCart() async => (await syncCart()).items;

  /// `GET /cart` هي نقطة المزامنة نفسها — طلبٌ واحد يعيد الأسطر وتعديلاتها.
  @override
  Future<CartSnapshot> syncCart() async {
    final data = await _api.get(ApiEndpoints.cart) as Map<String, dynamic>;
    final adjustments = data['adjustments'];
    return CartSnapshot(
      items: _mapLines(data),
      adjustments: adjustments is List
          ? adjustments
                .map((e) => CartAdjustment.fromJson(e as Map<String, dynamic>))
                .toList()
          : const [],
    );
  }

  @override
  Future<List<CartItem>> addToCart(
    String productId, {
    String? optionValue,
    int quantity = 1,
  }) async {
    final data = await _api.post(ApiEndpoints.cart, body: {
      'productId': productId,
      'optionValue': optionValue,
      'quantity': quantity,
    }) as Map<String, dynamic>;
    // الخادم يعيد { item, cart } حيث cart قائمة خطوط.
    final rawCart = data['cart'];
    if (rawCart is List) {
      return rawCart.map((e) => _mapLine(e as Map<String, dynamic>)).toList();
    }
    if (rawCart is Map<String, dynamic>) return _mapLines(rawCart);
    return _mapLines(data);
  }

  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async {
    final data = await _api.patch('${ApiEndpoints.cartItem}$lineId', body: {
      'quantity': quantity,
    }) as Map<String, dynamic>;
    return _mapLines(data);
  }

  @override
  Future<List<CartItem>> removeFromCart(String lineId) async {
    final data = await _api.delete('${ApiEndpoints.cartItem}$lineId')
        as Map<String, dynamic>;
    return _mapLines(data);
  }

  /// يحوّل صفوف الخادم إلى [CartItem].
  List<CartItem> _mapLines(Map<String, dynamic> data) {
    final items = data['items'];
    if (items is! List) return const [];
    return items.map((e) => _mapLine(e as Map<String, dynamic>)).toList();
  }

  /// يبني [CartItem] من سطرٍ واحد من الخادم.
  CartItem _mapLine(Map<String, dynamic> line) {
    final image = resolveMediaUrl(line['productImage'] as String?);
    // الاسم بلغتيه (066) — السلة تتبدّل مع لغة الواجهة بلا جلبٍ ثانٍ، والناقص
    // كردياً يبقى `null` صريحاً. `productName` (العربي) لردٍّ أقدم وحده.
    final names = BilingualText.fromJson(
      line,
      arKey: 'productNameAr',
      ckbKey: 'productNameCkb',
      legacyKey: 'productName',
    );
    final product = Product(
      id: line['productId']?.toString() ?? '',
      nameAr: names.ar,
      nameCkb: names.ckb,
      price: (line['unitPrice'] as num?)?.toDouble() ?? 0,
      images: image != null && image.isNotEmpty ? [image] : const [],
      stock: line['stock'] as int? ?? 0,
      // ترويج التوصيل يصل مع سطر السلة، فتستطيع السلة والدفع عرض «خصم
      // التوصيل» قبل الطلب. المعاينة فقط — الخادم يعيد حسابها عند الإنشاء.
      hasDeliveryPromo: line['hasDeliveryPromo'] as bool? ?? false,
      deliveryPromoAmount:
          (line['deliveryPromoAmount'] as num?)?.toDouble() ?? 0,
    );
    return CartItem(
      product: product,
      quantity: line['quantity'] as int? ?? 1,
      selectedOption: line['optionValue'] as String?,
      lineId: line['id']?.toString(),
    );
  }
}