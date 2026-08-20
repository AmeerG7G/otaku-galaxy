import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/entities/order.dart';
import '../../domain/usecases/fetch_order_details_usecase.dart';
import '../widgets/order_status_utils.dart';

@RoutePage()
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Order? _order;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final order = await context.read<FetchOrderDetailsUsecase>()(
        widget.orderId,
      );
      if (!mounted) return;
      setState(() => _order = order);
    } catch (_) {
      if (!mounted) return;
      setState(() => _order = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الطلب'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingState()
            : _error != null
            ? AnimeErrorState(message: _error!, onAction: _load)
            : order == null
            ? AnimeErrorState(
                title: 'الطلب غير موجود',
                message: 'تعذر العثور على تفاصيل هذا الطلب',
                actionLabel: 'العودة',
                onAction: () => Navigator.of(context).pop(),
              )
            : _buildOrderDetails(order),
      ),
    );
  }

  Widget _buildLoadingState() {
    return ListView(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      children: [
        _buildSectionSkeleton(),
        SizedBox(height: AppDimens.space5),
        _buildSectionSkeleton(),
        SizedBox(height: AppDimens.space5),
        _buildSectionSkeleton(),
      ],
    );
  }

  Widget _buildSectionSkeleton() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Column(
          children: List.generate(
            3,
            (index) => Padding(
              padding: EdgeInsets.only(
                bottom: index == 2 ? 0 : AppDimens.space3,
              ),
              child: Row(
                children: [
                  _buildSkeletonLine(width: 0.3, height: 16),
                  const Spacer(),
                  _buildSkeletonLine(width: 0.5, height: 16),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSkeletonLine({required double width, required double height}) {
    return FractionallySizedBox(
      widthFactor: width,
      child: Container(
        height: height,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              Theme.of(context).colorScheme.outlineVariant,
              Theme.of(context).colorScheme.surfaceContainerHighest,
            ],
          ),
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
        ),
      ),
    );
  }

  Widget _buildOrderDetails(Order order) {
    return CustomScrollView(
      slivers: [
        // رأس الطلب مع الحالة
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
            child: _buildOrderHeader(order),
          ),
        ),

        // خط تقدم الحالة
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            child: _buildOrderProgress(order),
          ),
        ),

        SliverToBoxAdapter(child: SizedBox(height: AppDimens.space5)),

        // معلومات الطلب
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            child: _buildInfoSection(order),
          ),
        ),

        SliverToBoxAdapter(child: SizedBox(height: AppDimens.space5)),

        // منتجات الطلب
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            child: _buildItemsSection(order),
          ),
        ),

        SliverToBoxAdapter(child: SizedBox(height: AppDimens.space5)),

        // ملخص الأسعار
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            child: _buildPriceSummary(order),
          ),
        ),

        SliverToBoxAdapter(child: SizedBox(height: AppDimens.space10)),
      ],
    );
  }

  Widget _buildOrderHeader(Order order) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Row(
          children: [
            // أيقونة الطلب
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: context.themeColors.primaryGradient,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              ),
              child: Icon(
                Icons.receipt_long,
                color: Colors.white,
                size: AppDimens.iconLg,
              ),
            ),
            SizedBox(width: AppDimens.space4),
            // رقم الطلب
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'طلب رقم ${order.number}',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: AppDimens.weightBold,
                    ),
                  ),
                  SizedBox(height: AppDimens.space1),
                  Text(
                    'تم الإنشاء في ${_formatDate(order.createdAt!)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            // شارة الحالة
            AnimeOrderStatusBadge(
              status: orderStatusLabel(order.status),
              size: BadgeSize.medium,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderProgress(Order order) {
    final colors = context.themeColors;
    final statuses = [
      (OrderStatus.pending, 'طلب جديد'),
      (OrderStatus.waitingAdmin, 'بانتظار التأكيد'),
      (OrderStatus.confirmed, 'مؤكد'),
      (OrderStatus.processing, 'قيد التجهيز'),
      (OrderStatus.delivering, 'قيد التوصيل'),
      (OrderStatus.completed, 'مكتمل'),
    ];

    final currentIndex = statuses.indexWhere((s) => s.$1 == order.status);
    final isRejected = order.status == OrderStatus.rejected;

    return Column(
      children: [
        // خط التقدم
        Row(
          children: List.generate(statuses.length, (index) {
            final isActive = !isRejected && index <= currentIndex;
            final isCurrent = !isRejected && index == currentIndex;
            final isCompleted = !isRejected && index < currentIndex;

            return Expanded(
              child: Row(
                children: [
                  // نقطة الحالة
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: isActive
                          ? context.themeColors.primaryGradient
                          : null,
                      color: isActive
                          ? null
                          : Theme.of(context).colorScheme.outlineVariant,
                      border: Border.all(
                        color: isActive
                            ? Colors.transparent
                            : Theme.of(context).colorScheme.outline,
                        width: 2,
                      ),
                      boxShadow: isCurrent
                          ? [
                              BoxShadow(
                                color: context.themeColors.glowPrimary,
                                blurRadius: 12,
                                spreadRadius: 2,
                              ),
                            ]
                          : null,
                    ),
                    child: isCompleted
                        ? Icon(Icons.check, size: 14, color: Colors.white)
                        : null,
                  ),
                  // خط الاتصال
                  if (index < statuses.length - 1)
                    Expanded(
                      child: Container(
                        height: 2,
                        margin: EdgeInsets.symmetric(
                          horizontal: AppDimens.space2,
                        ),
                        decoration: BoxDecoration(
                          gradient: isCompleted
                              ? context.themeColors.primaryGradient
                              : null,
                          color: isCompleted
                              ? null
                              : Theme.of(context).colorScheme.outlineVariant,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
        ),
        SizedBox(height: AppDimens.space4),
        // تسميات الحالات
        Row(
          children: List.generate(statuses.length, (index) {
            final isActive = !isRejected && index <= currentIndex;
            return Expanded(
              child: Text(
                statuses[index].$2,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: isActive
                      ? Theme.of(context).colorScheme.primary
                      : Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: isActive
                      ? AppDimens.weightBold
                      : AppDimens.weightRegular,
                ),
              ),
            );
          }),
        ),
        // حالة مرفوض
        if (isRejected) ...[
          SizedBox(height: AppDimens.space4),
          Container(
            width: double.infinity,
            padding: EdgeInsets.all(AppDimens.space4),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [colors.error, colors.errorLight],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.cancel_outlined,
                  color: Colors.white,
                  size: AppDimens.iconMd,
                ),
                SizedBox(width: AppDimens.space3),
                Text(
                  'تم رفض هذا الطلب',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildInfoSection(Order order) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'معلومات الطلب',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
            SizedBox(height: AppDimens.space4),
            _buildInfoRow(
              icon: Icons.location_on_outlined,
              label: 'المحافظة',
              value: order.province,
            ),
            _buildInfoRow(
              icon: Icons.home_outlined,
              label: 'العنوان الكامل',
              value: order.fullAddress,
            ),
            _buildInfoRow(
              icon: Icons.phone_outlined,
              label: 'رقم الهاتف',
              value: order.phone,
            ),
            _buildInfoRow(
              icon: Icons.local_shipping_outlined,
              label: 'تكلفة التوصيل',
              value: formatPrice(order.deliveryCost),
              valueColor: Theme.of(context).colorScheme.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Padding(
      padding: EdgeInsets.only(bottom: AppDimens.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: AppDimens.iconMd,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          SizedBox(width: AppDimens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
                SizedBox(height: AppDimens.space1),
                Text(
                  value,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontWeight: AppDimens.weightMedium,
                    color:
                        valueColor ?? Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsSection(Order order) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.all(AppDimens.cardPadding),
            child: Row(
              children: [
                Text(
                  'منتجات الطلب (${order.items.length})',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
          ),
          Divider(
            height: 1,
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            itemCount: order.items.length,
            separatorBuilder: (_, _) => Divider(
              height: 1,
              color: Theme.of(context).colorScheme.outlineVariant,
              indent: AppDimens.cardPadding,
              endIndent: AppDimens.cardPadding,
            ),
            itemBuilder: (context, index) {
              final item = order.items[index];
              return Padding(
                padding: EdgeInsets.all(AppDimens.cardPadding),
                child: Row(
                  children: [
                    // صورة المنتج
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                        color: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                        child: item.product.images.isNotEmpty
                            ? Image.network(
                                item.product.images.first,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => _buildPlaceholder(),
                              )
                            : _buildPlaceholder(),
                      ),
                    ),
                    SizedBox(width: AppDimens.space3),
                    // تفاصيل المنتج
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.product.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(fontWeight: AppDimens.weightMedium),
                          ),
                          SizedBox(height: AppDimens.space1),
                          Text(
                            'الكمية: ${item.quantity}',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ),
                    ),
                    // السعر
                    Text(
                      formatPrice(item.lineTotal),
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: AppDimens.weightBold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPlaceholder() {
    return Icon(
      Icons.image_outlined,
      size: AppDimens.iconMd,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    );
  }

  Widget _buildPriceSummary(Order order) {
    final subtotal = order.total - order.deliveryCost;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'ملخص الأسعار',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
            SizedBox(height: AppDimens.space4),
            _buildPriceRow('سعر المنتجات', formatPrice(subtotal)),
            _buildPriceRow('تكلفة التوصيل', formatPrice(order.deliveryCost)),
            Divider(
              height: AppDimens.space4,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            _buildPriceRow(
              'المجموع النهائي',
              formatPrice(order.total),
              isTotal: true,
              valueColor: Theme.of(context).colorScheme.primary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPriceRow(
    String label,
    String value, {
    bool isTotal = false,
    Color? valueColor,
  }) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: AppDimens.space2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: isTotal
                  ? AppDimens.weightSemiBold
                  : AppDimens.weightRegular,
              fontSize: isTotal
                  ? AppDimens.fontSizeTitleSmall
                  : AppDimens.fontSizeBodyMedium,
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: isTotal
                  ? AppDimens.weightExtraBold
                  : AppDimens.weightSemiBold,
              fontSize: isTotal
                  ? AppDimens.fontSizeTitleSmall
                  : AppDimens.fontSizeBodyMedium,
              color: valueColor ?? Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }
}
