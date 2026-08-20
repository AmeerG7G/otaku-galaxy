import '../entities/category.dart';
import '../entities/home_data.dart';
import '../entities/product.dart';
import '../entities/product_page.dart';

/// واجهة مستودع المنتجات (تعريف فقط).
/// التنفيذ الفعلي موجود في الطبقة data/.
abstract class ProductRepository {
  Future<HomeData> fetchHome();

  /// منتجات مع ترقيم صفحات — إعادة [ProductPage] تتضمن hasMore.
  Future<ProductPage> fetchProducts({
    int page,
    int limit,
    String? categoryId,
    String? subcategoryId,
  });

  Future<List<Category>> fetchCategories();

  Future<List<Product>> fetchCategoryProducts(String categoryId);

  Future<ProductPage> searchProducts(
    String query, {
    int page,
    int limit,
  });

  Future<Product> fetchProductDetails(String id);
}