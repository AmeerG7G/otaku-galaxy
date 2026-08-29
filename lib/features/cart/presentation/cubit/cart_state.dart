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

  /// مجموع ترويج التوصيل عن كل القطع المؤهَّلة في السلة.
  ///
  /// معاينة فقط: الخادم يعيد حسابها وتطبيقها عند إنشاء الطلب بنفس القاعدة
  /// (المجموع مسقوفاً برسوم التوصيل)، والتطبيق لا يقرّر خصماً أبداً.
  double get deliveryPromoTotal => items.fold(
    0,
    (sum, item) => item.product.hasDeliveryPromo
        ? sum + item.product.deliveryPromoAmount * item.quantity
        : sum,
  );

  /// خصم التوصيل المعروض لرسوم توصيل معيّنة — مسقوف بالرسوم نفسها.
  double deliveryDiscountFor(double deliveryFee) {
    if (deliveryFee <= 0) return 0;
    final promo = deliveryPromoTotal;
    return promo < deliveryFee ? promo : deliveryFee;
  }

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
