import '../entities/category.dart';
import '../entities/category_order.dart';
import '../repositories/product_repository.dart';

/// جلب قائمة الأقسام.
class FetchCategoriesUsecase {
  const FetchCategoriesUsecase(this._repository);

  final ProductRepository _repository;

  /// [CRITICAL] الترتيب المعتمد يُفرض هنا، عند الباب الذي تمرّ منه كل شاشة
  /// تعرض الأقسام (الأقسام، المجتمع، منتجات القسم). فرضُه في كل شاشة على
  /// حدة كان يعني ترتيباً يختلف بين شاشة وأخرى متى نُسيت واحدة — وهو
  /// بالضبط ما طُلب تفاديه.
  Future<List<Category>> call() async =>
      sortByCanonicalOrder(await _repository.fetchCategories());
}
