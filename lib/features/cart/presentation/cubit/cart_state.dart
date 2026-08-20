import 'package:equatable/equatable.dart';

import '../../domain/entities/cart_item.dart';

/// حالة سلة التسوق.
sealed class CartState extends Equatable {
  const CartState({required this.items});

  /// عناصر السلة الحالية.
  final List<CartItem> items;

  /// عدد القطع الكلي.
  int get count => items.fold(0, (sum, item) => sum + item.quantity);

  /// المجموع الإجمالي.
  double get total => items.fold(0, (sum, item) => sum + item.lineTotal);

  /// البحث عن عنصر حسب معرّف المنتج.
  CartItem? itemById(String productId) {
    for (final item in items) {
      if (item.product.id == productId) return item;
    }
    return null;
  }

  @override
  List<Object?> get props => [items];
}

/// حالة سلة فارغة.
final class CartEmpty extends CartState {
  const CartEmpty() : super(items: const []);
}

/// حالة سلة تحتوي عناصر.
final class CartLoaded extends CartState {
  const CartLoaded({required super.items});
}
