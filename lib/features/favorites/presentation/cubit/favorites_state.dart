import 'package:equatable/equatable.dart';

import '../../../products/domain/entities/product.dart';

/// حالة قائمة المفضلة.
sealed class FavoritesState extends Equatable {
  const FavoritesState({required this.products});

  /// المنتجات المفضلة الحالية.
  final List<Product> products;

  bool isFavorite(String productId) {
    for (final product in products) {
      if (product.id == productId) return true;
    }
    return false;
  }

  @override
  List<Object?> get props => [products];
}

/// قائمة مفضلة فارغة.
final class FavoritesEmpty extends FavoritesState {
  const FavoritesEmpty() : super(products: const []);
}

/// قائمة مفضلة تحتوي منتجات.
final class FavoritesLoaded extends FavoritesState {
  const FavoritesLoaded({required super.products});
}
