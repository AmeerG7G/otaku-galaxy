import 'package:flutter/material.dart';

import '../../../../features/orders/domain/entities/order.dart';
import '../../../../features/orders/presentation/widgets/order_status_utils.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../feedback/product_photo_slot.dart';
import '../layout/otaku_surfaces.dart';

/// بطاقة طلب بتصميم Otaku Galaxy v2.
///
/// سطح عائم يبدأ بالتاريخ وكبسولة الحالة، ثم ملخّص نصّي، ثم فاصل رفيع
/// يفصل صفّ مصغّرات المنتجات عن الإجمالي — بلا `Card` مادي ولا `ListTile`.
class AnimeOrderCard extends StatelessWidget {
  const AnimeOrderCard({super.key, required this.order, this.onTap});

  final Order order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = orderStatusColor(order.status);
    final thumbs = order.items.take(3).toList();
    final itemCount = order.items.fold<int>(0, (sum, i) => sum + i.quantity);

    return OtakuPanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                // لا يُعرض رقم الطلب للعميل — التاريخ للتعريف البصري فقط.
                child: Text(
                  order.createdAt != null ? _formatDate(order.createdAt!) : '',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              OtakuStatusPill(
                label: orderStatusLabel(order.status),
                color: statusColor,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            order.province.isEmpty
                ? order.fullAddress
                : '${order.province} — ${order.fullAddress}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              height: 1.6,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (order.status == OrderStatus.rejected &&
              (order.rejectionReason?.isNotEmpty ?? false)) ...[
            const SizedBox(height: 9),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  margin: const EdgeInsets.only(top: 5),
                  decoration: const BoxDecoration(
                    color: AppColors.error,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    order.rejectionReason!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontSize: 11.5,
                      height: 1.5,
                      color: AppColors.error,
                      fontWeight: AppDimens.weightMedium,
                    ),
                  ),
                ),
              ],
            ),
          ],
          Container(
            height: 1,
            margin: const EdgeInsets.symmetric(vertical: 13),
            color: theme.colorScheme.outlineVariant,
          ),
          Row(
            children: [
              // مصغّرات المنتجات — فتحات صور محايدة متداخلة.
              SizedBox(
                height: 38,
                width: thumbs.isEmpty ? 0 : 38 + (thumbs.length - 1) * 26,
                child: Stack(
                  children: [
                    for (var i = 0; i < thumbs.length; i++)
                      PositionedDirectional(
                        start: i * 26,
                        child: Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(
                              AppDimens.radiusXs,
                            ),
                            border: Border.all(
                              color: theme.colorScheme.surface,
                              width: 2,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: ProductPhotoSlot(
                            imageUrl: thumbs[i].product.images.isNotEmpty
                                ? thumbs[i].product.images.first
                                : null,
                            showLabel: false,
                            iconSize: 14,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$itemCount منتج',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontSize: 11,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${order.total.toStringAsFixed(0)} د.ع',
                    textDirection: TextDirection.ltr,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontFamily: 'Tajawal',
                      fontWeight: AppDimens.weightExtraBold,
                      fontSize: 14.5,
                      color: AppColors.secondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) => '${date.day}/${date.month}/${date.year}';
}
