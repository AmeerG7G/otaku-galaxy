import '../entities/governorate.dart';

/// واجهة مستودع المحافظات وتكلفة التوصيل.
abstract class GovernorateRepository {
  Future<List<Governorate>> fetchGovernorates();

  /// مناطق التوصيل النشطة داخل محافظة (قائمة فارغة إن لم تكن مقسّمة).
  Future<List<DeliveryZone>> fetchZones(String governorateId);
}
