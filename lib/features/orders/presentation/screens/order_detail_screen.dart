import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/router/app_router.dart';
import '../../../birthday/data/birthday_storage.dart';
import '../../../birthday/presentation/birthday_prompt.dart';
import '../../../points/presentation/cubit/points_cubit.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/utils/formatters.dart';
import '../../domain/entities/order.dart';
import '../../domain/repositories/order_repository.dart';
import '../../domain/usecases/fetch_order_details_usecase.dart';
import '../widgets/order_status_utils.dart';

@RoutePage()
class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({
    super.key,
    required this.orderId,
    this.confirmOnOpen = false,
  });

  final String orderId;

  /// يفتح مسار تأكيد الاستلام مباشرةً بعد التحميل.
  ///
  /// تستخدمه ورقة «هل استلمت طلبك؟» عند فتح التطبيق: العميل أجاب «نعم»
  /// هناك، فننفّذ التأكيد هنا بنفس المسار الذي يستخدمه الزرّ داخل الشاشة —
  /// فلا تُكرَّر منح النقاط ولا طلب الميلاد ولا الانتقال للتقييم في مكانين.
  final bool confirmOnOpen;

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

  /// يمنع ضغطتين متتاليتين على «نعم، استلمت الطلب».
  bool _confirming = false;

  /// يُستهلك مرة واحدة، فإعادة تحميل الشاشة لا تعيد تنفيذ التأكيد.
  late bool _confirmOnOpenPending = widget.confirmOnOpen;

  Future<void> _load() async {
    try {
      final order = await context.read<FetchOrderDetailsUsecase>()(
        widget.orderId,
      );
      if (!mounted) return;
      setState(() => _order = order);

      // التأكيد المطلوب من الورقة يجري بعد أن تُحمَّل الحالة الحقيقية، ولا
      // يُعاد إن كان الطلب قد خرج من «قيد التوصيل» بين الشاشتين.
      if (_confirmOnOpenPending &&
          order.status == OrderStatus.delivering &&
          mounted) {
        _confirmOnOpenPending = false;
        await _confirmReceived(order);
      }
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

    return Scaffold(
      body: Column(
        children: [
          // ترويسة v2: تاريخ الطلب عنواناً وكبسولة الحالة في نهاية السطر.
          OtakuScreenHeader.compact(
            title: order?.createdAt != null
                ? _formatDate(order!.createdAt!)
                : 'تفاصيل الطلب',
            onBack: () => context.router.maybePop(),
            trailing: order == null
                ? null
                : OtakuStatusPill(
                    label: orderStatusLabel(order.status),
                    color: orderStatusColor(order.status),
                  ),
          ),
          Expanded(
            child: _loading
                ? _buildLoadingState()
                : _error != null
                ? AnimeErrorState(message: _error!, onAction: _load)
                : order == null
                ? AnimeErrorState(
                    title: 'الطلب غير موجود',
                    message: 'تعذر العثور على تفاصيل هذا الطلب',
                    actionLabel: 'العودة',
                    onAction: () => context.router.maybePop(),
                  )
                : _buildOrderDetails(order),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) => '${date.day}/${date.month}/${date.year}';

  /// حالة تحميل تفاصيل الطلب — هياكل متلألئة بإيقاع أقسام الشاشة.
  Widget _buildLoadingState() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
      children: const [
        OtakuSkeleton.box(height: 150, radius: AppDimens.radiusXl),
        SizedBox(height: 18),
        OtakuListSkeleton(count: 3, height: 120, padding: EdgeInsets.zero),
      ],
    );
  }

  Widget _buildOrderDetails(Order order) {
    final rejected = order.status == OrderStatus.rejected;
    final completed = order.status == OrderStatus.completed;
    final awaitingReceipt =
        order.status == OrderStatus.delivering ||
        order.status == OrderStatus.processing;

    return CustomScrollView(
      slivers: [
        // بطاقة الحالة — أهم عنصر في الشاشة.
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 0),
            child: _OrderStatusCard(order: order),
          ),
        ),

        // مسار الطلب — يُخفى تماماً عند الرفض.
        if (!rejected)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: _OrderJourney(order: order),
            ),
          ),

        // تأكيد الاستلام أو دعوة التقييم.
        if (awaitingReceipt)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: _buildReceiptPrompt(order),
            ),
          ),
        if (completed)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: _ReviewInvite(
                order: order,
                onTap: () => context.router.push(RateOrderRoute(order: order)),
              ),
            ),
          ),

        // المنتجات
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 22, 18, 0),
            child: _buildItemsSection(order),
          ),
        ),

        // معلومات التوصيل — غير ذات صلة للطلب المرفوض.
        if (!rejected)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: _buildInfoSection(order),
            ),
          ),

        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
            child: _buildPriceSummary(order),
          ),
        ),

        const SliverToBoxAdapter(child: SizedBox(height: 40)),
      ],
    );
  }

  /// «هل استلمت طلبك؟» — بنفس لغة بطاقات تفاصيل الطلب v2.
  /// تأكيد الاستلام يعيد استخدام المسار الموجود: منح نقاط الاستلام، فتح
  /// خيار عيد الميلاد بعد أول طلب، ثم الانتقال لتقييم منتجات الطلب.
  Widget _buildReceiptPrompt(Order order) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        boxShadow: colors.shadowXSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.successPale,
                  borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                ),
                child: Icon(
                  Icons.inventory_2_outlined,
                  size: 21,
                  color: colors.success,
                ),
              ),
              const SizedBox(width: AppDimens.space3),
              Expanded(
                child: Text(
                  'هل استلمت طلبك؟',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontSize: 16,
                    fontWeight: AppDimens.weightExtraBold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppDimens.space3),
          Text(
            'أكّد الاستلام حتى تقدر تقيّم المنتجات وتكسب نقاط المجرّة.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              height: 1.75,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AppDimens.space5),
          AnimePrimaryButton(
            label: 'نعم، استلمت الطلب',
            onPressed: () => _confirmReceived(order),
            loading: _confirming,
            height: AppDimens.buttonHeightXl,
          ),
          const SizedBox(height: AppDimens.space3),
          SizedBox(
            width: double.infinity,
            child: TextButton(
              onPressed: _notReceivedYet,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 15),
                backgroundColor: Theme.of(
                  context,
                ).colorScheme.surfaceContainerHighest,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  side: BorderSide(
                    color: Theme.of(context).colorScheme.outlineVariant,
                    width: 1.5,
                  ),
                ),
              ),
              child: Text(
                'لم أستلمه بعد',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: AppDimens.weightBold,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _notReceivedYet() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: const Text(
            'خلّينا الطلب فعّال — راح نسألك مرة ثانية لاحقاً.',
          ),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
  }

  /// تأكيد الاستلام عبر مسار الخادم `‎/orders/{id}/confirm-receipt`.
  ///
  /// الخادم ينقل الطلب إلى «تم الاستلام» ويمنح النقاط ويرسل الإشعار مرة
  /// واحدة؛ التطبيق لا يمنح شيئاً محلياً. بعد النجاح نحدّث الحالة المعروضة
  /// من ردّ الخادم مباشرة ثم ننتقل لتقييم منتجات الطلب.
  Future<void> _confirmReceived(Order order) async {
    if (_confirming) return;
    setState(() => _confirming = true);
    try {
      final updated = await sl<OrderRepository>().confirmReceipt(order.id);
      if (!mounted) return;
      setState(() => _order = updated);

      // النقاط ورصيد عيد الميلاد تغيّرا على الخادم — نُعيد قراءتهما.
      await Future.wait([
        context.read<PointsCubit>().load(),
        sl<BirthdayStorage>().refresh(),
      ]);
      if (!mounted) return;

      // أول طلب مستلَم يفتح خيار عيد الميلاد. الشرطان يأتيان من الخادم عبر
      // `refresh()` أعلاه: `isUnlocked` مشتقّ من الطلبات المكتملة، و
      // `hasBirthday` من العمود المحفوظ — فلا يظهر الطلب لمن أدخله سابقاً
      // ولو أعاد تثبيت التطبيق أو دخل من جهاز آخر.
      await _promptBirthdayIfDue();
      if (!mounted) return;

      // التقييم يُفتح في اللحظة التي قرّرها الخادم (`ratingAvailableAt`)، لا
      // بعد ٢٤ ساعة من ضغطة الزرّ. إن كانت النافذة ما تزال مغلقة نبقى في
      // تفاصيل الطلب حيث تعرض بطاقة التقييم الوقت المتبقي الحقيقي، بدل دفع
      // العميل إلى شاشة كتابة سيرفض الخادمُ إرسالَها.
      if (updated.ratingAvailable) {
        await context.router.push(RateOrderRoute(order: updated));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(_confirmErrorOf(e)),
            backgroundColor: context.themeColors.error,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(AppDimens.screenHorizontalPadding),
          ),
        );
      // حالة الطلب ربما تغيّرت من جهة الإدارة — نُعيد قراءتها.
      await _load();
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  /// يعرض طلب تاريخ الميلاد إن كان مستحقاً، مرة واحدة فقط.
  ///
  /// لا يُخزَّن شيء محلياً ليقرّر الظهور: بعد الحفظ يصير `hasBirthday`
  /// صحيحاً على الخادم، فلا يعود الشرط منطبقاً في أي تشغيل لاحق — ولا بعد
  /// إعادة تثبيت التطبيق أو الدخول من جهاز آخر.
  Future<void> _promptBirthdayIfDue() async {
    final birthday = sl<BirthdayStorage>();
    if (!birthday.isUnlocked || birthday.hasBirthday) return;

    final saved = await showBirthdayPrompt(
      context,
      intro:
          'هذا أول طلب توصلك — نحب نعرف تاريخ ميلادك حتى نعطيك خصم '
          '${birthday.discountPercent}٪ على طلب واحد بيوم ميلادك. '
          'لا يمكن تغيير التاريخ بعد حفظه.',
    );
    if (!saved || !mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: const Text('تاريخ ميلادك محفوظ 🎂'),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
  }

  /// رسالة واضحة لكل سبب رفض يرسله الخادم.
  String _confirmErrorOf(Object e) {
    if (e is AppException) {
      if (e.code == 'ALREADY_CONFIRMED') {
        return 'تم تأكيد استلام هذا الطلب مسبقاً';
      }
      if (e.code == 'NOT_OUT_FOR_DELIVERY') {
        return 'لا يمكن تأكيد الاستلام قبل خروج الطلب للتوصيل';
      }
      if (e.message.trim().isNotEmpty) return e.message;
    }
    return 'تعذر تأكيد الاستلام، حاول مرة أخرى';
  }

  Widget _buildInfoSection(Order order) {
    return OtakuPanel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'معلومات الطلب',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: AppDimens.weightBold),
          ),
          SizedBox(height: AppDimens.space4),
          _buildInfoRow(
            icon: Icons.location_on_outlined,
            label: 'المحافظة',
            value: order.province,
          ),
          // منطقة التوصيل تظهر فقط للمحافظات المقسّمة مناطق.
          if (order.zoneName != null && order.zoneName!.trim().isNotEmpty)
            _buildInfoRow(
              icon: Icons.my_location_outlined,
              label: 'منطقة التوصيل',
              value: order.zoneName!,
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
    return OtakuPanel(
      padding: EdgeInsets.zero,
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
    // المجموع الفرعي من عناصر الطلب نفسها — اشتقاقه من الإجمالي يتجاهل
    // خصم التوصيل وخصم عيد الميلاد فيعطي رقماً خاطئاً.
    final subtotal = order.items.fold<double>(
      0,
      (sum, item) => sum + item.lineTotal,
    );
    return OtakuPanel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ملخص الأسعار',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: AppDimens.weightBold),
          ),
          SizedBox(height: AppDimens.space4),
          _buildPriceRow('سعر المنتجات', formatPrice(subtotal)),
          _buildPriceRow('تكلفة التوصيل', formatPrice(order.deliveryCost)),
          if (order.deliveryDiscount > 0)
            _buildPriceRow(
              'خصم التوصيل',
              '-${formatPrice(order.deliveryDiscount)}',
              valueColor: context.themeColors.success,
            ),
          if (order.isFreeDelivery)
            _buildPriceRow(
              '',
              'توصيل مجاني 🎉',
              valueColor: context.themeColors.success,
            ),
          if (order.discount > 0)
            _buildPriceRow(
              'الخصم',
              '-${formatPrice(order.discount)}',
              valueColor: context.themeColors.success,
            ),
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
}

/// بطاقة حالة الطلب — العنصر الأبرز في الشاشة، بلون ونبرة حسب الحالة.
/// للطلب المرفوض تعرض السبب مباشرة بلا أي معلومات توصيل.
class _OrderStatusCard extends StatelessWidget {
  const _OrderStatusCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final rejected = order.status == OrderStatus.rejected;

    final (
      String title,
      String body,
      IconData icon,
      List<Color> gradient,
    ) = switch (order.status) {
      OrderStatus.pending || OrderStatus.waitingAdmin => (
        'بانتظار الموافقة',
        'استلمنا طلبك — سنراجعه ونتواصل معك عبر واتساب لتأكيد التفاصيل.',
        Icons.hourglass_top_rounded,
        [const Color(0xFFFFB02E), const Color(0xFFFF3D8F)],
      ),
      OrderStatus.confirmed => (
        'تم قبول طلبك 🎉',
        'طلبك مقبول وقيد التجهيز، وسيبدأ التوصيل قريباً.',
        Icons.verified_rounded,
        [const Color(0xFF22B07D), const Color(0xFF4EA8FF)],
      ),
      OrderStatus.processing || OrderStatus.delivering => (
        'قيد التوصيل',
        'طلبك في الطريق إليك — الدفع عند الاستلام.',
        Icons.local_shipping_rounded,
        [const Color(0xFF4EA8FF), const Color(0xFF7C5CFF)],
      ),
      OrderStatus.completed => (
        'تم الاستلام',
        'نتمنى المنتجات عجبتك — شاركنا رأيك واكسب نقاط المجرّة.',
        Icons.check_circle_rounded,
        [const Color(0xFF22B07D), const Color(0xFF7C5CFF)],
      ),
      OrderStatus.rejected => (
        'مرفوض',
        'ما تم قبول هذا الطلب. تقدر تتواصل معنا أو تسوي طلب جديد.',
        Icons.cancel_rounded,
        [colors.error, colors.errorLight],
      ),
    };

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradient,
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppDimens.radiusXl),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withValues(alpha: 0.30),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          PositionedDirectional(
            top: -46,
            end: -34,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.13),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                      ),
                      child: Icon(icon, color: Colors.white, size: 23),
                    ),
                    const SizedBox(width: AppDimens.space4),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(
                                  fontSize: 20,
                                  fontWeight: AppDimens.weightBlack,
                                  color: Colors.white,
                                ),
                          ),
                          if (order.createdAt != null)
                            Text(
                              // لا يُعرض رقم الطلب — التاريخ فقط.
                              '${order.createdAt!.day}/${order.createdAt!.month}/${order.createdAt!.year}',
                              textDirection: TextDirection.ltr,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: Colors.white.withValues(alpha: 0.85),
                                  ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppDimens.space4),
                Text(
                  body,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    height: 1.75,
                    color: Colors.white.withValues(alpha: 0.95),
                  ),
                ),
                // سبب الرفض الفعلي من الإدارة.
                if (rejected &&
                    order.rejectionReason != null &&
                    order.rejectionReason!.trim().isNotEmpty) ...[
                  const SizedBox(height: AppDimens.space4),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.20),
                      borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'سبب الرفض',
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                fontWeight: AppDimens.weightExtraBold,
                                color: Colors.white.withValues(alpha: 0.85),
                              ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          order.rejectionReason!,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(height: 1.7, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// مسار الطلب — أربع محطات رأسية بنقاط متصلة، بدل شريط أفقي عام.
class _OrderJourney extends StatelessWidget {
  const _OrderJourney({required this.order});

  final Order order;

  static const _steps = [
    ('بانتظار الموافقة', 'راجعنا الطلب وتأكيده عبر واتساب'),
    ('تم قبول الطلب', 'الطلب مقبول وقيد التجهيز'),
    ('قيد التوصيل', 'الطلب في الطريق إليك'),
    ('تم الاستلام', 'وصل الطلب — يمكنك تقييم المنتجات'),
  ];

  /// الحالات التي تُغذّي كل خطوة معروضة.
  static const _stepStatuses = <List<OrderStatus>>[
    [OrderStatus.pending, OrderStatus.waitingAdmin],
    [OrderStatus.confirmed],
    [OrderStatus.processing, OrderStatus.delivering],
    [OrderStatus.completed],
  ];

  /// وقت أول انتقال يخصّ الخطوة، من سجل الخادم. null يعني «لم تحدث بعد»
  /// أو أن الطلب قديم بلا سجل — فلا نخترع وقتاً.
  DateTime? _timeFor(int index) {
    for (final event in order.statusHistory) {
      if (_stepStatuses[index].contains(event.status)) return event.createdAt;
    }
    return null;
  }

  int get _currentIndex => switch (order.status) {
    OrderStatus.pending || OrderStatus.waitingAdmin => 0,
    OrderStatus.confirmed => 1,
    OrderStatus.processing || OrderStatus.delivering => 2,
    OrderStatus.completed => 3,
    OrderStatus.rejected => -1,
  };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final current = _currentIndex;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        boxShadow: colors.shadowXSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'مسار الطلب',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontSize: 16,
              fontWeight: AppDimens.weightExtraBold,
            ),
          ),
          const SizedBox(height: AppDimens.space4),
          for (var i = 0; i < _steps.length; i++)
            _JourneyStep(
              title: _steps[i].$1,
              body: _steps[i].$2,
              done: i < current,
              active: i == current,
              isLast: i == _steps.length - 1,
              occurredAt: _timeFor(i),
            ),
          // موعد الوصول المتوقع بعد القبول.
          if (current >= 1 && current < 3) ...[
            const SizedBox(height: AppDimens.space2),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: colors.successPale,
                borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: AppDimens.iconSm,
                    color: colors.success,
                  ),
                  const SizedBox(width: AppDimens.space3),
                  Expanded(
                    child: Text(
                      // وقت الوصول الذي تدخله الإدارة يسبق النص العام.
                      order.deliveryNote?.trim().isNotEmpty == true
                          ? order.deliveryNote!
                          : 'موعد الوصول المتوقع خلال ٢–٤ أيام حسب المحافظة.',
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        fontSize: 12,
                        height: 1.6,
                        fontWeight: AppDimens.weightBold,
                        color: colors.success,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _JourneyStep extends StatelessWidget {
  const _JourneyStep({
    required this.title,
    required this.body,
    required this.done,
    required this.active,
    required this.isLast,
    this.occurredAt,
  });

  final String title;
  final String body;
  final bool done;
  final bool active;
  final bool isLast;

  /// وقت حدوث الخطوة من سجل الخادم؛ null فلا يُعرض وقت.
  final DateTime? occurredAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reached = done || active;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: reached ? colors.primaryGradient : null,
                  color: reached
                      ? null
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  boxShadow: active
                      ? [
                          BoxShadow(
                            color: colors.glowPrimary,
                            blurRadius: 12,
                            spreadRadius: 1,
                          ),
                        ]
                      : null,
                ),
                child: done
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: reached
                              ? Colors.white
                              : Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: done
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.outlineVariant,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppDimens.space4),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontSize: 14,
                      fontWeight: reached
                          ? AppDimens.weightBold
                          : AppDimens.weightMedium,
                      color: reached
                          ? Theme.of(context).colorScheme.onSurface
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    body,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11.5,
                      height: 1.6,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  // وقت الخطوة كما سجّله الخادم — يظهر للخطوات التي حدثت
                  // فعلاً فقط، ولا يُعرض شيء للطلبات القديمة بلا سجل.
                  if (occurredAt != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      formatOrderStepTime(occurredAt!),
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontSize: 10.5,
                        fontWeight: AppDimens.weightBold,
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// دعوة تقييم المنتجات بعد الاستلام.
/// دعوة التقييم بعد الاستلام.
///
/// التقييم يُفتح بعد مهلة من الاستلام، والقرار يأتي من الخادم في
/// [Order.ratingAvailable] — لا من ساعة الجهاز ولا من مؤقّت في الواجهة،
/// فتغيير وقت الهاتف لا يفتح التقييم مبكراً.
class _ReviewInvite extends StatelessWidget {
  const _ReviewInvite({required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final available = order.ratingAvailable;
    final remaining = order.timeUntilRating;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.star_rounded, color: colors.warning, size: 22),
              const SizedBox(width: AppDimens.space2),
              Expanded(
                child: Text(
                  available ? 'قيّم منتجات طلبك' : 'التقييم يُفتح قريباً',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontSize: 16,
                    fontWeight: AppDimens.weightExtraBold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppDimens.space2),
          Text(
            available
                ? 'رأيك يساعد بقية العملاء — والتقييم المصوّر يعطيك ٥ نقاط مجرّة.'
                : remaining == null
                // لا نذكر مدّة لا نعرفها: الخادم لم يرسل موعداً بعد.
                ? 'نفتح التقييم بعد استلام الطلب بمدّة قصيرة، وراح يوصلك تنبيه.'
                : 'التقييم متاح بعد ${formatRemaining(remaining)} — '
                      'راح يوصلك تنبيه وقتها.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              height: 1.7,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AppDimens.space4),
          AnimePrimaryButton(
            label: available ? 'قيّم المنتجات' : 'لسه ما فتح التقييم',
            // زرّ معطّل بدل شاشة ترفض الإرسال بعد ملء التقييم كاملاً.
            onPressed: available ? onTap : null,
            height: AppDimens.buttonHeightXl,
          ),
        ],
      ),
    );
  }
}
