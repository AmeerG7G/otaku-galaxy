import '../entities/category.dart';
import '../repositories/product_repository.dart';

/// جلب قائمة الأقسام.
class FetchCategoriesUsecase {
  const FetchCategoriesUsecase(this._repository);

  final ProductRepository _repository;

  Future<List<Category>> call() => _repository.fetchCategories();
}
