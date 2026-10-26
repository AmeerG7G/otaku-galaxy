import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/governorate.dart';
import '../../domain/repositories/governorate_repository.dart';

/// تنفيذ مستودع المحافظات عبر الـ API الحقيقي.
class GovernorateRepositoryImpl implements GovernorateRepository {
  GovernorateRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<List<Governorate>> fetchGovernorates() async {
    final data = await _api.get(ApiEndpoints.governorates)
        as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => Governorate.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<List<DeliveryZone>> fetchZones(String governorateId) async {
    final data =
        await _api.get('${ApiEndpoints.governorateZones}$governorateId/zones')
            as Map<String, dynamic>;
    return (data['items'] as List? ?? const [])
        .map((e) => DeliveryZone.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}