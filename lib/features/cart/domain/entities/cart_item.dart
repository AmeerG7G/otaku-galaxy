import '../../../products/domain/entities/product.dart';

class CartItem {
  const CartItem({
    required this.product,
    this.quantity = 1,
    this.selectedOption,
    this.lineId,
  });

  final Product product;
  final int quantity;
  final String? selectedOption;

  /// معرّف سطر العربة لدى الخادم (لتحديث الكمية/الحذف).
  final String? lineId;

  double get lineTotal => product.price * quantity;

  factory CartItem.fromJson(Map<String, dynamic> json) {
    return CartItem(
      product: Product.fromJson(json['product'] as Map<String, dynamic>),
      quantity: json['quantity'] as int? ?? 1,
      selectedOption: json['selectedOption'] as String?,
      lineId: json['id']?.toString(),
    );
  }

  CartItem copyWith({int? quantity, String? selectedOption, String? lineId}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
      selectedOption: selectedOption ?? this.selectedOption,
      lineId: lineId ?? this.lineId,
    );
  }
}