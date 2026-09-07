import 'banner.dart';
import 'category.dart';
import 'category_order.dart';
import 'product.dart';

class HomeData {
  const HomeData({
    this.banners = const [],
    this.heroBanner,
    this.promoBanners = const [],
    this.offers = const [],
    this.selectedProducts = const [],
    this.categories = const [],
    this.discover = const [],
  });

  final List<Banner> banners;

  /// لوحة البطل — واحدة يختارها المسؤول بالترتيب، أو null فيبقى التصميم
  /// الافتراضي المضمَّن.
  final Banner? heroBanner;

  /// الشريط الترويجي — عدد مفتوح بترتيب المسؤول.
  final List<Banner> promoBanners;
  final List<Product> offers;
  final List<Product> selectedProducts;
  final List<Category> categories;
  final List<Product> discover;

  factory HomeData.fromJson(Map<String, dynamic> json) {
    final hero = json['heroBanner'];
    return HomeData(
      banners: (json['banners'] as List? ?? const [])
          .map((e) => Banner.fromJson(e as Map<String, dynamic>))
          .toList(),
      heroBanner: hero is Map<String, dynamic> ? Banner.fromJson(hero) : null,
      promoBanners: (json['promoBanners'] as List? ?? const [])
          .map((e) => Banner.fromJson(e as Map<String, dynamic>))
          .toList(),
      offers: _products(json['offers']),
      selectedProducts: _products(json['selectedProducts']),
      // الترتيب المعتمد يُطبَّق عند القراءة لا عند العرض — انظر
      // `sortByCanonicalOrder`. ترتيبٌ يُطبَّق في كل شاشة على حدة يعني
      // شاشةً منسيّة تعرض ترتيباً آخر.
      categories: sortByCanonicalOrder(
        (json['categories'] as List? ?? const [])
            .map((e) => Category.fromJson(e as Map<String, dynamic>))
            .toList(),
      ),
      discover: _products(json['discover']),
    );
  }

  static List<Product> _products(dynamic data) {
    return (data as List? ?? const [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
