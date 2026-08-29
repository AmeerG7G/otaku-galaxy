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

  // [REMOVED] `CartItem.fromJson` — لم يكن يُستدعى قط، وكان يقرأ
  // `json['product']` بينما الخادم يعيد سطر سلة مسطّحاً بلا هذا المفتاح
  // إطلاقاً. أي استعمال له كان سيرمي وقت التشغيل. التحويل الحقيقي والوحيد
  // هو `CartRepositoryImpl._mapLine`، وهو يقرأ الشكل الذي يرسله الخادم فعلاً.

  CartItem copyWith({int? quantity, String? selectedOption, String? lineId}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
      selectedOption: selectedOption ?? this.selectedOption,
      lineId: lineId ?? this.lineId,
    );
  }
}