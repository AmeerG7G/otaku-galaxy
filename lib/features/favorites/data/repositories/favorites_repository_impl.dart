import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../../products/domain/entities/product.dart';
import '../../domain/repositories/favorites_repository.dart';

/// تنفيذ مستودع المفضلة عبر الـ API الحقيقي.
class FavoritesRepositoryImpl implements FavoritesRepository {
  FavoritesRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<List<Product>> fetchFavorites() async {
    final data =
        await _api.get(ApiEndpoints.favorites, query: {'page': 1, 'limit': 50})
            as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> addFavorite(String productId) async {
    await _api.post(ApiEndpoints.favorites, body: {'productId': productId});
  }

  @override
  Future<void> removeFavorite(String productId) async {
    await _api.delete('${ApiEndpoints.favoriteItem}$productId');
  }
}
