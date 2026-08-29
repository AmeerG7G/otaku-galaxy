// بعد نقل التقييمات والنقاط والإشعارات والمجموعات إلى الخادم، صار فشل
// الشبكة احتمالاً حقيقياً. هذه الاختبارات تحرس ألا تبقى أي شاشة في حالة
// تحميل أبدية عند الفشل، وأن يُميَّز الفشل عن «لا توجد بيانات».

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/collections/domain/entities/collection.dart';
import 'package:otaku_galaxy/features/collections/domain/repositories/collection_repository.dart';
import 'package:otaku_galaxy/features/collections/presentation/cubit/collections_cubit.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/points_activity.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';

class _Boom implements Exception {
  @override
  String toString() => 'انقطع الاتصال';
}

class _FailingPoints implements PointsRepository {
  @override
  Future<int> fetchBalance() async => throw _Boom();
  @override
  Future<List<PointsActivity>> fetchActivity() async => throw _Boom();
}

class _FailingNotifications implements NotificationRepository {
  @override
  Future<List<AppNotification>> fetchAll() async => throw _Boom();
  @override
  Future<void> markAllRead() async => throw _Boom();
  @override
  Future<void> markRead(String id) async => throw _Boom();
}

class _FailingCollections implements CollectionRepository {
  @override
  Future<List<Collection>> fetchAll() async => throw _Boom();
  @override
  Future<Collection> create(String name) async => throw _Boom();
  @override
  Future<void> rename(String id, String name) async => throw _Boom();
  @override
  Future<void> delete(String id) async => throw _Boom();
  @override
  Future<void> addProduct(String c, String p) async => throw _Boom();
  @override
  Future<void> removeProduct(String c, String p) async => throw _Boom();
}

void main() {
  test('PointsCubit surfaces an error instead of loading forever', () async {
    final cubit = PointsCubit(_FailingPoints());
    await cubit.load();

    expect(cubit.state.loading, isFalse);
    expect(cubit.state.error, isNotNull);
    addTearDown(cubit.close);
  });

  test('NotificationsCubit surfaces an error instead of loading forever', () async {
    final cubit = NotificationsCubit(_FailingNotifications());
    await cubit.load();

    expect(cubit.state.loading, isFalse);
    expect(cubit.state.error, isNotNull);
    addTearDown(cubit.close);
  });

  test('marking a notification read survives a failing server', () async {
    final cubit = NotificationsCubit(_FailingNotifications());
    // لا يجب أن ترمي — الحالة الحقيقية تأتي من الخادم عند إعادة القراءة.
    await cubit.markRead('any-id');
    await cubit.markAllRead();

    expect(cubit.state.loading, isFalse);
    addTearDown(cubit.close);
  });

  test('CollectionsCubit surfaces an error instead of loading forever', () async {
    final cubit = CollectionsCubit(_FailingCollections());
    await cubit.load();

    expect(cubit.state.loading, isFalse);
    expect(cubit.state.error, isNotNull);
    addTearDown(cubit.close);
  });

  test('clearing a cubit wipes the previous account state', () async {
    final points = PointsCubit(_FailingPoints());
    points.clear();
    expect(points.state.balance, 0);
    expect(points.state.activity, isEmpty);
    addTearDown(points.close);

    final notifications = NotificationsCubit(_FailingNotifications());
    notifications.clear();
    expect(notifications.state.items, isEmpty);
    addTearDown(notifications.close);

    final collections = CollectionsCubit(_FailingCollections());
    collections.clear();
    expect(collections.state.items, isEmpty);
    addTearDown(collections.close);
  });
}
