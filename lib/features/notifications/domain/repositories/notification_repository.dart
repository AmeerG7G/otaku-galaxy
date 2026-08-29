import '../entities/app_notification.dart';

/// واجهة مستودع الإشعارات (تعريف فقط).
abstract class NotificationRepository {
  Future<List<AppNotification>> fetchAll();
  Future<void> markAllRead();
  Future<void> markRead(String id);
}
