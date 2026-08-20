import '../../../cart/domain/entities/cart_item.dart';
import '../../../products/domain/entities/product.dart';

enum OrderStatus {
  pending,
  waitingAdmin,
  confirmed,
  processing,
  delivering,
  completed,
  rejected;

  static OrderStatus fromString(String value) {
    switch (value) {
      case 'PENDING_ADMIN_CONFIRMATION':
        return OrderStatus.waitingAdmin;
      case 'CONFIRMED':
        return OrderStatus.confirmed;
      case 'PREPARING':
        return OrderStatus.processing;
      case 'OUT_FOR_DELIVERY':
        return OrderStatus.delivering;
      case 'COMPLETED':
        return OrderStatus.completed;
      case 'REJECTED':
        return OrderStatus.rejected;
      default:
        return OrderStatus.pending;
    }
  }
}

class Order {
  const Order({
    required this.id,
    required this.number,
    required this.province,
    required this.deliveryCost,
    required this.fullAddress,
    required this.phone,
    required this.total,
    required this.status,
    this.productsTotal = 0,
    this.discount = 0,
    this.items = const [],
    this.createdAt,
  });

  final String id;
  final String number;
  final String province;
  final double deliveryCost;
  final String fullAddress;
  final String phone;
  final double total;

  /// إجمالي سعر المنتجات قبل التوصيل (من الخادم).
  final double productsTotal;

  /// الخصم المطبق (من الخادم).
  final double discount;
  final OrderStatus status;
  final List<CartItem> items;
  final DateTime? createdAt;

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id']?.toString() ?? '',
      number: json['number']?.toString() ?? '',
      province: json['province'] as String? ?? '',
      deliveryCost: (json['deliveryFee'] as num?)?.toDouble() ?? 0,
      fullAddress: json['fullAddress'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      total: (json['total'] as num?)?.toDouble() ?? 0,
      productsTotal: (json['productsTotal'] as num?)?.toDouble() ?? 0,
      discount: (json['discount'] as num?)?.toDouble() ?? 0,
      status: OrderStatus.fromString(json['status'] as String? ?? ''),
      items: (json['items'] as List? ?? const [])
          .map((e) => _mapItem(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }

  /// يحوّل عنصر طلب الخادم
  /// ({ productId, productName, imageUrl, optionValue, price, quantity, lineTotal })
  /// إلى [CartItem] بالنموذج الذي تعرضه الواجهة.
  static CartItem _mapItem(Map<String, dynamic> json) {
    final image = json['imageUrl'] as String?;
    return CartItem(
      product: Product.fromJson({
        'id': json['productId']?.toString() ?? '',
        'name': json['productName'] as String? ?? '',
        'price': (json['price'] as num?)?.toDouble() ?? 0,
        'images': image != null && image.isNotEmpty ? [image] : const [],
        'stock': (json['quantity'] as num?)?.toInt() ?? 0,
      }),
      quantity: json['quantity'] as int? ?? 1,
      selectedOption: json['optionValue'] as String?,
    );
  }
}