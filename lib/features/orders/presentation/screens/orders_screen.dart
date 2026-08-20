import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/order.dart';
import '../../domain/usecases/fetch_my_orders_usecase.dart';
import '../widgets/order_status_utils.dart';

@RoutePage()
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Order> _orders = [];
  bool _loading = true;
  String? _error;

  /// الأقسام بترتيب رحلة الطلب من "بانتظار التأكيد" حتى "مكتمل/مرفوض".
  final List<({OrderStatus status, String title})> _sections = [
    (status: OrderStatus.waitingAdmin, title: 'بانتظار التأكيد'),
    (status: OrderStatus.confirmed, title: 'تم التأكيد'),
    (status: OrderStatus.processing, title: 'قيد التجهيز'),
    (status: OrderStatus.delivering, title: 'قيد التوصيل'),
    (status: OrderStatus.completed, title: 'مكتمل'),
    (status: OrderStatus.rejected, title: 'مرفوض'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fetchOrders = context.read<FetchMyOrdersUsecase>();
      final orders = await fetchOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  /// طلبات القسم (تُضم طلبات [OrderStatus.pending] ضمن بانتظار التأكيد).
  List<Order> _ordersIn({required OrderStatus status}) {
    if (status == OrderStatus.waitingAdmin) {
      return _orders
          .where(
            (o) =>
                o.status == OrderStatus.waitingAdmin ||
                o.status == OrderStatus.pending,
          )
          .toList();
    }
    return _orders.where((o) => o.status == status).toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingList()
            : _error != null
            ? AnimeErrorState(message: _error!, onAction: _load)
            : _orders.isEmpty
            ? AnimeEmptyState(
                title: 'لا توجد طلبات',
                subtitle: 'لم تقم بأي طلبات بعد. ابدأ التسوق الآن!',
                icon: Icons.receipt_long_outlined,
              )
            : RefreshIndicator(
                onRefresh: _load,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    for (final section in _sections)
                      if (_ordersIn(status: section.status).isNotEmpty) ...[
                        SliverToBoxAdapter(
                          child: _buildSectionHeader(context, section),
                        ),
                        SliverToBoxAdapter(
                          child: _buildSectionOrders(context, section),
                        ),
                        SliverToBoxAdapter(
                          child: SizedBox(height: AppDimens.space4),
                        ),
                      ],
                    SliverToBoxAdapter(
                      child: SizedBox(height: AppDimens.space4),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context,
    ({OrderStatus status, String title}) section,
  ) {
    final orders = _ordersIn(status: section.status);
    final sectionColor = orderStatusColor(section.status);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppDimens.screenHorizontalPadding,
        AppDimens.space3,
        AppDimens.screenHorizontalPadding,
        AppDimens.space2,
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [sectionColor, sectionColor.withValues(alpha: 0.7)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            ),
            child: Icon(
              _sectionIcon(section.status),
              color: Colors.white,
              size: AppDimens.iconMd,
            ),
          ),
          SizedBox(width: AppDimens.space3),
          Expanded(
            child: Text(
              section.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
          ),
          Container(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.space3,
              vertical: AppDimens.space1,
            ),
            decoration: BoxDecoration(
              color: sectionColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
            ),
            child: Text(
              '${orders.length}',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                fontWeight: AppDimens.weightBold,
                color: sectionColor,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionOrders(
    BuildContext context,
    ({OrderStatus status, String title}) section,
  ) {
    final orders = _ordersIn(status: section.status);

    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: AppDimens.screenHorizontalPadding,
      ),
      child: Column(
        children: [
          for (final order in orders)
            Padding(
              padding: EdgeInsets.only(bottom: AppDimens.space3),
              child: AnimeOrderCard(
                order: order,
                onTap: () =>
                    context.router.push(OrderDetailRoute(orderId: order.id)),
              ),
            ),
        ],
      ),
    );
  }

  IconData _sectionIcon(OrderStatus status) {
    switch (status) {
      case OrderStatus.pending:
      case OrderStatus.waitingAdmin:
        return Icons.hourglass_top;
      case OrderStatus.confirmed:
        return Icons.verified_outlined;
      case OrderStatus.processing:
        return Icons.inventory_2_outlined;
      case OrderStatus.delivering:
        return Icons.local_shipping_outlined;
      case OrderStatus.completed:
        return Icons.check_circle_outline;
      case OrderStatus.rejected:
        return Icons.cancel_outlined;
    }
  }

  Widget _buildLoadingList() {
    return ListView.separated(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      itemCount: 5,
      separatorBuilder: (_, _) => SizedBox(height: AppDimens.space3),
      itemBuilder: (context, index) => _buildOrderSkeleton(),
    );
  }

  Widget _buildOrderSkeleton() {
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
            Row(
              children: [
                _buildSkeletonLine(width: 0.4, height: 20),
                const Spacer(),
                _buildSkeletonLine(width: 0.3, height: 24),
              ],
            ),
            SizedBox(height: AppDimens.space3),
            Row(
              children: [
                _buildSkeletonLine(width: 0.5, height: 16),
                const Spacer(),
                _buildSkeletonLine(width: 0.3, height: 20),
              ],
            ),
          ],
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
}
