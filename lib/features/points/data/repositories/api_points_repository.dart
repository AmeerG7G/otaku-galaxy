import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/level_reward.dart';
import '../../domain/entities/otaku_level.dart';
import '../../domain/repositories/points_repository.dart';

/// تنفيذ [PointsRepository] عبر الـ API الحقيقي.
///
/// نداء واحد يعيد الرصيد والحركات والسلّم وموضع الزبون عليه وحالة مزاياه.
class ApiPointsRepository implements PointsRepository {
  ApiPointsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<PointsSummary> fetchSummary() async {
    final data = await _api.get(ApiEndpoints.points);
    return PointsSummary.fromJson((data as Map<String, dynamic>?) ?? const {});
  }

  @override
  Future<LevelReward> claimReward(String levelKey) async {
    final data = await _api.post(ApiEndpoints.claimReward(levelKey));
    return LevelReward.fromJson((data as Map<String, dynamic>?) ?? const {});
  }

  @override
  Future<List<OtakuLevel>> fetchLevels() async {
    final data = await _api.get(ApiEndpoints.loyaltyLevels);
    final items = ((data as Map<String, dynamic>?)?['items'] as List?) ?? const [];
    return [
      for (final item in items)
        if (item is Map<String, dynamic>) OtakuLevel.fromJson(item),
    ];
  }
}
