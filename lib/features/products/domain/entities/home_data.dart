import 'banner.dart';
import 'category.dart';
import 'product.dart';

class HomeData {
  const HomeData({
    this.banners = const [],
    this.offers = const [],
    this.selectedProducts = const [],
    this.categories = const [],
    this.discover = const [],
  });

  final List<Banner> banners;
  final List<Product> offers;
  final List<Product> selectedProducts;
  final List<Category> categories;
  final List<Product> discover;

  factory HomeData.fromJson(Map<String, dynamic> json) {
    return HomeData(
      banners: (json['banners'] as List? ?? const [])
          .map((e) => Banner.fromJson(e as Map<String, dynamic>))
          .toList(),
      offers: _products(json['offers']),
      selectedProducts: _products(json['selectedProducts']),
      categories: (json['categories'] as List? ?? const [])
          .map((e) => Category.fromJson(e as Map<String, dynamic>))
          .toList(),
      discover: _products(json['discover']),
    );
  }

  static List<Product> _products(dynamic data) {
    return (data as List? ?? const [])
        .map((e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
