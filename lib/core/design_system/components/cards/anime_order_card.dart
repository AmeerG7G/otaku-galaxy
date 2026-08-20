import 'package:flutter/material.dart';

import '../../../../features/orders/domain/entities/order.dart';
import '../../tokens/app_dimens.dart';
import '../feedback/anime_order_status_badge.dart';

class AnimeOrderCard extends StatelessWidget {
  const AnimeOrderCard({super.key, required this.order, this.onTap});

  final Order order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(AppDimens.cardPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'طلب رقم ${order.number}',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: AppDimens.weightBold,
                      ),
                    ),
                  ),
                  AnimeOrderStatusBadge(
                    status: _statusKey(order.status),
                    size: BadgeSize.small,
                  ),
                ],
              ),
              SizedBox(height: AppDimens.space3),
              Row(
                children: [
                  Icon(
                    Icons.location_on_outlined,
                    size: AppDimens.iconSm,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  SizedBox(width: AppDimens.space2),
                  Text(
                    order.province,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  SizedBox(width: AppDimens.space4),
                  Text(
                    '${order.total.toStringAsFixed(0)} د.ع',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: AppDimens.weightBold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _statusKey(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
        return 'طلب جديد';
      case OrderStatus.waitingAdmin:
        return 'بانتظار تأكيد الإدارة';
      case OrderStatus.confirmed:
        return 'تم تأكيد الطلب';
      case OrderStatus.processing:
        return 'قيد التجهيز';
      case OrderStatus.delivering:
        return 'قيد التوصيل';
      case OrderStatus.completed:
        return 'مكتمل';
      case OrderStatus.rejected:
        return 'مرفوض';
    }
  }
}
