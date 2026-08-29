import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/app_notification.dart';
import '../../domain/repositories/notification_repository.dart';

class NotificationsState {
  const NotificationsState({
    this.items = const [],
    this.loading = false,
    this.error,
  });

  final List<AppNotification> items;
  final bool loading;

  /// رسالة فشل آخر تحميل — تُعرض كحالة خطأ قابلة لإعادة المحاولة.
  final String? error;

  int get unreadCount => items.where((n) => !n.read).length;
  bool get hasUnread => unreadCount > 0;
}

class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit(this._repository) : super(const NotificationsState());

  final NotificationRepository _repository;

  Future<void> load() async {
    emit(NotificationsState(items: state.items, loading: true));
    try {
      final items = await _repository.fetchAll();
      emit(NotificationsState(items: items, loading: false));
    } catch (e) {
      // بعد الانتقال للخادم صار الفشل ممكناً — لا نترك الشاشة في تحميل أبدي.
      emit(NotificationsState(items: state.items, loading: false, error: '$e'));
    }
  }

  Future<void> markAllRead() async {
    try {
      await _repository.markAllRead();
    } catch (_) {
      // فشل التعليم لا يمنع إعادة القراءة؛ الحالة الحقيقية تأتي من الخادم.
    }
    await load();
  }

  Future<void> markRead(String id) async {
    try {
      await _repository.markRead(id);
    } catch (_) {
      // كما أعلاه — الخادم هو مصدر حالة القراءة.
    }
    await load();
  }

  /// يُفرغ الإشعارات عند تبديل الحساب حتى لا تظهر إشعارات مستخدم لآخر.
  void clear() => emit(const NotificationsState());
}
