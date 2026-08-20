import '../entities/home_data.dart';
import '../repositories/product_repository.dart';

/// جلب بيانات الصفحة الرئيسية (بانرات، عروض، مختارة، أقسام، اكتشف).
class FetchHomeUsecase {
  const FetchHomeUsecase(this._repository);

  final ProductRepository _repository;

  Future<HomeData> call() => _repository.fetchHome();
}
