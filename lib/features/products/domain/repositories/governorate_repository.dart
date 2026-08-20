import '../entities/governorate.dart';

/// واجهة مستودع المحافظات وتكلفة التوصيل.
abstract class GovernorateRepository {
  Future<List<Governorate>> fetchGovernorates();
}