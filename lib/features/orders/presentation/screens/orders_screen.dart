import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/locale_refetch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/order.dart';
import '../../domain/usecases/fetch_my_orders_usecase.dart';
import '../../../visuals/domain/visual_slot.dart';

/// قائمة طلباتي بتصميم Otaku Galaxy v2.
///
/// ترويسة نصية بعنوان ثقيل ورسم باهت، ثم قائمة بطاقات عائمة مرتّبة
/// زمنياً. الحالة تظهر على كل بطاقة مباشرة بلا تبويبات فلترة.
@RoutePage()
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> with LocaleRefetch {
  List<Order> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// المحتوى الخادمي يُصرَّف لحظة الجلب — يُعاد جلبه بلغة الواجهة الجديدة.
  @override
  void onLanguageChanged() => _load();

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // عمودٌ موسَّط بعرض القراءة على اللوح — القائمة الممتدّة بعرض
      // ١٣٦٦ بكسل تصير صفوفاً فارغة الوسط. لا أثر له على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kReadingMaxWidth,
        child: Column(
          children: [
            OtakuScreenHeader(
              title: context.strings('myOrders'),
              subtitle: context.strings('ordersSubtitle'),
              artwork: 'assets/art/opt/a-i4.png',
              artworkSlot: VisualSlots.ordersHeader,
              onBack: () => context.router.maybePop(),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const OtakuListSkeleton(count: 4, height: 132);
    if (_error != null) {
      return AnimeErrorState(message: _error!, onAction: _load);
    }
    if (_orders.isEmpty) {
      return AnimeEmptyState(
        title: context.strings('noOrdersTitle'),
        subtitle: context.strings('noOrdersBody'),
        artwork: 'assets/art/opt/a-luffy-kid.png',
        artworkSlot: VisualSlots.emptyOrders,
        actionLabel: context.strings('startShopping'),
        onAction: () => context.router.maybePop(),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
        itemCount: _orders.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final order = _orders[index];
          return AnimeOrderCard(
            order: order,
            onTap: () =>
                context.router.push(OrderDetailRoute(orderId: order.id)),
            // زرّ التقييم يخصّ هذا الطلب: يُفتح تقييم منتجاته هو، ولا يمرّ
            // بشاشة عامة. الأهلية من الخادم (`canReview`) لا من الحالة هنا.
            onReview: () async {
              await context.router.push(RateOrderRoute(order: order));
              // العودة من التقييم قد تُغيّر ما يُعرض (تقييم أُرسل) — نُعيد
              // القراءة من الخادم بدل تخمين النتيجة محلياً.
              if (context.mounted) await _load();
            },
          );
        },
      ),
    );
  }
}
