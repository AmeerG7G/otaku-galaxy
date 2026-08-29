import '../entities/governorate.dart';
import '../repositories/governorate_repository.dart';

/// جلب المحافظات المتاحة وتكلفة التوصيل لكل منها.
class FetchGovernoratesUsecase {
  const FetchGovernoratesUsecase(this._repository);

  final GovernorateRepository _repository;

  Future<List<Governorate>> call() => _repository.fetchGovernorates();

  /// مناطق التوصيل داخل محافظة — فارغة إن لم تكن المحافظة مقسّمة مناطق.
  Future<List<DeliveryZone>> zones(String governorateId) =>
      _repository.fetchZones(governorateId);
}