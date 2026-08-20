import '../../../products/domain/entities/product.dart';

/// واجهة مستودع المفضلة — خلفية الخادم.
abstract class FavoritesRepository {
  /// المنتجات المفضلة للمستخدم.
  Future<List<Product>> fetchFavorites();

  /// إضافة منتج للمفضلة.
  Future<void> addFavorite(String productId);

  /// إزالة منتج من المفضلة.
  Future<void> removeFavorite(String productId);
}