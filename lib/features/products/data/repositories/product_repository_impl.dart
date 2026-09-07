import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/category.dart';
import '../../domain/entities/home_data.dart';
import '../../domain/entities/product.dart';
import '../../domain/entities/product_sort.dart';
import '../../domain/entities/product_page.dart';
import '../../domain/repositories/product_repository.dart';

/// تنفيذ مستودع المنتجات عبر الـ API الحقيقي.
class ProductRepositoryImpl implements ProductRepository {
  ProductRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<HomeData> fetchHome() async {
    final data = await _api.get(ApiEndpoints.homeData)
        as Map<String, dynamic>;
    return HomeData.fromJson(data);
  }

  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async {
    final data = await _api.get(ApiEndpoints.products, query: {
      'page': page,
      'limit': limit,
      'categoryId': ?categoryId,
      'subcategoryId': ?subcategoryId,
    }) as Map<String, dynamic>;
    return ProductPage.fromJson(data);
  }

  @override
  Future<List<Category>> fetchCategories() async {
    final data = await _api.get(ApiEndpoints.categories)
        as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => Category.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async {
    final query = <String, dynamic>{
      'page': 1,
      'limit': 50,
      if (categoryId.isNotEmpty && categoryId != 'all') 'categoryId': categoryId,
      // الترتيب يتم على الخادم ليشمل الكتالوج كله لا الصفحة المحمّلة فقط.
      if (sort != null) 'sort': sort.apiValue,
    };
    final data = await _api.get(ApiEndpoints.categoryProducts, query: query)
        as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
  }) async {
    final data = await _api.get(ApiEndpoints.search, query: {
      'q': query,
      'page': page,
      'limit': limit,
    }) as Map<String, dynamic>;
    return ProductPage.fromJson(data);
  }

  @override
  Future<Product> fetchProductDetails(String id) async {
    final data = await _api.get('${ApiEndpoints.productDetails}$id')
        as Map<String, dynamic>;
    return Product.fromJson(data);
  }
}