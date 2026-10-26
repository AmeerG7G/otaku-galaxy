import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/app_notification.dart';
import '../../domain/repositories/notification_repository.dart';

/// تنفيذ [NotificationRepository] عبر الـ API الحقيقي.
class ApiNotificationRepository implements NotificationRepository {
  ApiNotificationRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<List<AppNotification>> fetchAll() async {
    final data = await _api.get(ApiEndpoints.notifications);
    final map = (data as Map<String, dynamic>?) ?? const {};
    return (map['items'] as List? ?? const [])
        .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> markAllRead() async {
    await _api.post(ApiEndpoints.notificationsReadAll);
  }

  @override
  Future<void> markRead(String id) async {
    await _api.post('${ApiEndpoints.notifications}/$id/read');
  }
}
