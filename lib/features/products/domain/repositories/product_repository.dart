import '../entities/category.dart';
import '../entities/home_data.dart';
import '../entities/product.dart';
import '../entities/product_sort.dart';
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

  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  });

  Future<ProductPage> searchProducts(
    String query, {
    int page,
    int limit,
  });

  Future<Product> fetchProductDetails(String id);
}

/// قراءاتٌ تحمل إشارة قياسٍ تجميعي (D3) في ترويسة الطلب نفسه.
///
/// قدرةٌ اختيارية فوق [ProductRepository]: المستودع الحقيقي يطبّقها، وبدائل
/// الاختبار لا تحتاج أن تعرفها — فيسقط الطلب عندها إلى القراءة العادية بلا
/// ترويسة. الإشارة لا تغيّر الردّ؛ الخادم يعدّها فقط.
abstract interface class TrackedProductRepository implements ProductRepository {
  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page,
    int limit,
    Map<String, String>? headers,
  });

  @override
  Future<Product> fetchProductDetails(String id, {Map<String, String>? headers});
}