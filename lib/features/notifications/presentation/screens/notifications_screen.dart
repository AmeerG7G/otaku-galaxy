import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/app_notification.dart';
import '../cubit/notifications_cubit.dart';

/// مركز الإشعارات بتصميم Otaku Galaxy v2.
///
/// ترويسة مضغوطة بإجراء «تعليم الكل» نصّي، ثم مجموعات زمنية بعناوين
/// صغيرة متباعدة الأحرف، وصفوف عائمة تميّز غير المقروء بلمسة وردية.
@RoutePage()
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<NotificationsCubit>().load();
  }

  /// يجمع الإشعارات في مجموعات زمنية كما في التصميم.
  /// يعلّم الإشعار كمقروء ثم يفتح وجهته إن أرسلها الخادم.
  ///
  /// الوجهة تأتي من `orderId`/`productId` في المغلف — لا نستنتجها من نصّ
  /// الإشعار ولا نخترع معرّفات.
  void _openNotification(AppNotification item) {
    context.read<NotificationsCubit>().markRead(item.id);

    final orderId = item.orderId;
    if (orderId != null && orderId.isNotEmpty) {
      context.router.push(OrderDetailRoute(orderId: orderId));
      return;
    }
    final productId = item.productId;
    if (productId != null && productId.isNotEmpty) {
      context.router.push(ProductDetailRoute(productId: productId));
      return;
    }
    // إشعار بلا وجهة (ترويج مثلاً) — يكفي تعليمه مقروءاً.
  }

  Map<String, List<AppNotification>> _group(List<AppNotification> items) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final groups = <String, List<AppNotification>>{};

    for (final item in items) {
      final day = DateTime(
        item.createdAt.year,
        item.createdAt.month,
        item.createdAt.day,
      );
      // المصدر يعرّف ثلاث مجموعات فقط: اليوم، هذا الأسبوع، أقدم.
      final label = day == today
          ? 'اليوم'
          : day.isAfter(today.subtract(const Duration(days: 7)))
          ? 'هذا الأسبوع'
          : 'أقدم';
      groups.putIfAbsent(label, () => []).add(item);
    }
    return groups;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocBuilder<NotificationsCubit, NotificationsState>(
        builder: (context, state) {
          return Column(
            children: [
              OtakuScreenHeader.compact(
                title: 'الإشعارات',
                onBack: () => context.router.maybePop(),
                trailing: state.hasUnread
                    ? AnimeTextButton(
                        label: 'تعليم الكل كمقروء',
                        onPressed: () =>
                            context.read<NotificationsCubit>().markAllRead(),
                      )
                    : null,
              ),
              Expanded(child: _buildBody(context, state)),
            ],
          );
        },
      ),
    );
  }

  Widget _buildBody(BuildContext context, NotificationsState state) {
    if (state.loading && state.items.isEmpty) {
      return const OtakuListSkeleton(count: 5, height: 92);
    }
    if (state.error != null && state.items.isEmpty) {
      return AnimeErrorState(
        message: state.error!,
        onAction: () => context.read<NotificationsCubit>().load(),
      );
    }
    if (state.items.isEmpty) {
      return const AnimeEmptyState(
        title: 'لا توجد إشعارات',
        subtitle: 'كل تحديثات طلباتك وتقييماتك راح تظهر هنا أول ما تصير.',
        artwork: 'assets/art/opt/a-i3.png',
      );
    }

    final groups = _group(state.items);
    return RefreshIndicator(
      onRefresh: () => context.read<NotificationsCubit>().load(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 6, 18, 26),
        children: [
          for (final entry in groups.entries) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 6, 0, 11),
              child: Text(
                entry.key,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontSize: 11.5,
                  fontWeight: AppDimens.weightBold,
                  letterSpacing: 0.6,
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
            ),
            for (final item in entry.value) ...[
              _NotificationRow(
                notification: item,
                onTap: () => _openNotification(item),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

/// صفّ إشعار — أيقونة مربّعة ملوّنة ونص متدرّج الأهمية.
class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  (IconData, Color) _visual(BuildContext context) {
    final colors = context.themeColors;
    return switch (notification.type) {
      NotificationType.orderAccepted => (
        Icons.check_circle_outline,
        colors.success,
      ),
      NotificationType.orderRejected => (Icons.cancel_outlined, colors.error),
      NotificationType.deliveryUpdate => (
        Icons.local_shipping_outlined,
        AppColors.accentCyan,
      ),
      NotificationType.receiptReminder => (Icons.help_outline, colors.warning),
      NotificationType.reviewApproved => (Icons.star_rounded, AppColors.accent),
      NotificationType.reviewRejected => (Icons.error_outline, colors.error),
      NotificationType.backInStock => (
        Icons.inventory_2_outlined,
        colors.success,
      ),
      NotificationType.promotion => (
        Icons.local_offer_outlined,
        AppColors.secondary,
      ),
    };
  }

  String _relativeTime() {
    final diff = DateTime.now().difference(notification.createdAt);
    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'قبل ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'قبل ${diff.inHours} ساعة';
    return 'قبل ${diff.inDays} يوم';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (icon, color) = _visual(context);
    final unread = !notification.read;

    return OtakuPanel(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 14),
      color: unread
          ? Color.alphaBlend(
              AppColors.secondary.withValues(alpha: 0.06),
              theme.colorScheme.surface,
            )
          : theme.colorScheme.surface,
      borderColor: unread
          ? AppColors.secondary.withValues(alpha: 0.24)
          : theme.colorScheme.outlineVariant,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        notification.title,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13.5,
                          height: 1.45,
                          fontWeight: AppDimens.weightBold,
                        ),
                      ),
                    ),
                    if (unread) ...[
                      const SizedBox(width: 8),
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.only(top: 6),
                        decoration: const BoxDecoration(
                          color: AppColors.secondary,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.body,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    height: 1.6,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _relativeTime(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontSize: 10.5,
                    color: theme.colorScheme.outline,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
