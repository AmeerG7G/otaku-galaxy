import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../orders/domain/entities/order_data.dart';
import '../../../orders/domain/usecases/place_order_usecase.dart';
import '../widgets/order_success_view.dart';

/// مراجعة الطلب بتصميم Otaku Galaxy v2.
///
/// ترويسة بخطوة «٢ من ٢»، ثم أسطح عائمة لمعلومات التوصيل والمنتجات
/// وملخّص الأسعار، ثم شريط تأكيد سفلي. بعد الإرسال تُستبدل الشاشة كلها
/// بصفحة نجاح تحريرية بملء الشاشة — لا حوار مادي.
@RoutePage()
class OrderReviewScreen extends StatefulWidget {
  const OrderReviewScreen({super.key, required this.orderData});

  final OrderData orderData;

  @override
  State<OrderReviewScreen> createState() => _OrderReviewScreenState();
}

class _OrderReviewScreenState extends State<OrderReviewScreen> {
  bool _loading = false;
  bool _placed = false;

  Future<void> _confirm() async {
    setState(() => _loading = true);
    try {
      await context.read<PlaceOrderUsecase>()(widget.orderData);
      if (!mounted) return;
      context.read<CartCubit>().clear();
      setState(() => _placed = true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            // رسالة الخادم تقول للعميل ما الذي ينقص بالضبط («اختر محافظة
            // صالحة»، «اختر منطقة التوصيل»، «المخزون غير كافٍ»…). طمسُها
            // خلف نص عام يترك العميل يعيد الضغط بلا فائدة.
            content: Text(_placeErrorOf(error)),
            backgroundColor: context.themeColors.error,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(18),
            duration: const Duration(seconds: 4),
          ),
        );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// نص الخطأ المعروض عند تعذّر إنشاء الطلب — من الخادم متى أرسل واحداً.
  String _placeErrorOf(Object error) {
    if (error is AppException) {
      switch (error.code) {
        case 'ZONE_REQUIRED':
          return 'اختر منطقة التوصيل قبل إرسال الطلب.';
        case 'ZONE_INVALID':
        case 'ZONE_NOT_SUPPORTED':
          return 'منطقة التوصيل غير صالحة لهذه المحافظة.';
        case 'BIRTHDAY_DISCOUNT_USED':
          return 'خصم عيد الميلاد مستخدم هذه السنة.';
        default:
          return error.message;
      }
    }
    return 'تعذر إرسال الطلب. حاول مرة أخرى.';
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.orderData;

    // بعد نجاح الإرسال تحلّ صفحة النجاح محلّ الشاشة بالكامل.
    if (_placed) {
      return Scaffold(
        body: OrderSuccessView(
          onOpenOrders: () {
            context.router.popUntilRoot();
            context.router.push(const OrdersRoute());
          },
          onKeepShopping: () {
            mainNavIndex.value = MainTab.home;
            context.router.popUntilRoot();
          },
        ),
      );
    }

    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader(
            title: 'مراجعة الطلب',
            subtitle: 'الخطوة ٢ من ٢',
            onBack: () => context.router.maybePop(),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildDeliveryInfo(data),
                  const SizedBox(height: 13),
                  _buildItemsSection(data),
                  const SizedBox(height: 13),
                  _buildPriceSummary(data),
                ],
              ),
            ),
          ),
          _buildConfirmBar(),
        ],
      ),
    );
  }

  Widget _sectionCard({required String title, required List<Widget> children}) {
    return OtakuPanel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontFamily: 'Tajawal',
              fontSize: 15,
              fontWeight: AppDimens.weightExtraBold,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _buildDeliveryInfo(OrderData data) {
    return _sectionCard(
      title: 'معلومات التوصيل',
      children: [
        _infoRow('المحافظة', data.province),
        _infoRow('العنوان الكامل', data.fullAddress),
        _infoRow('رقم الهاتف', data.phone, ltr: true, last: true),
      ],
    );
  }

  Widget _infoRow(
    String label,
    String value, {
    bool ltr = false,
    bool last = false,
  }) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            textDirection: ltr ? TextDirection.ltr : null,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 14,
              height: 1.5,
              fontWeight: AppDimens.weightSemiBold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsSection(OrderData data) {
    final theme = Theme.of(context);

    return _sectionCard(
      title: 'منتجات الطلب (${data.items.length})',
      children: [
        for (var i = 0; i < data.items.length; i++) ...[
          if (i > 0) const SizedBox(height: 13),
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                clipBehavior: Clip.antiAlias,
                child: ProductPhotoSlot(
                  imageUrl: data.items[i].product.images.isNotEmpty
                      ? data.items[i].product.images.first
                      : null,
                  showLabel: false,
                  iconSize: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      data.items[i].product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 13.5,
                        height: 1.5,
                        fontWeight: AppDimens.weightSemiBold,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'الكمية ${data.items[i].quantity}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11.5,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                formatPrice(data.items[i].lineTotal),
                textDirection: TextDirection.ltr,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontFamily: 'Tajawal',
                  fontSize: 14,
                  fontWeight: AppDimens.weightExtraBold,
                  color: AppColors.secondary,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildPriceSummary(OrderData data) {
    final theme = Theme.of(context);

    return _sectionCard(
      title: 'ملخّص الأسعار',
      children: [
        // المجموع الفرعي مباشرةً — اشتقاقه من الإجمالي صار خاطئاً بعد
        // دخول خصم التوصيل في المعادلة.
        _priceRow('سعر المنتجات', formatPrice(data.productsTotal)),
        const SizedBox(height: 10),
        _priceRow('رسوم التوصيل', formatPrice(data.deliveryCost)),
        if (data.deliveryDiscount > 0) ...[
          const SizedBox(height: 10),
          _priceRow(
            'خصم التوصيل',
            '-${formatPrice(data.deliveryDiscount)}',
            color: AppColors.success,
          ),
        ],
        if (data.deliveryCost > 0 && data.payableDelivery == 0) ...[
          const SizedBox(height: 10),
          _priceRow('', 'توصيل مجاني 🎉', color: AppColors.success),
        ],
        if (data.discount > 0) ...[
          const SizedBox(height: 10),
          _priceRow(
            'الخصم',
            '-${formatPrice(data.discount)}',
            color: AppColors.success,
          ),
        ],
        Container(
          height: 1,
          margin: const EdgeInsets.symmetric(vertical: 14),
          color: theme.colorScheme.outlineVariant,
        ),
        Row(
          children: [
            Expanded(
              child: Text(
                'المجموع النهائي',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontFamily: 'Tajawal',
                  fontSize: 16,
                  fontWeight: AppDimens.weightExtraBold,
                ),
              ),
            ),
            Text(
              formatPrice(data.total),
              textDirection: TextDirection.ltr,
              style: theme.textTheme.titleLarge?.copyWith(
                fontFamily: 'Tajawal',
                fontSize: 20,
                fontWeight: AppDimens.weightBlack,
                color: AppColors.secondary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'الدفع عند الاستلام — ما تدفع شي قبل ما يوصلك الطلب.',
          style: theme.textTheme.bodySmall?.copyWith(
            fontSize: 11.5,
            height: 1.6,
            color: theme.colorScheme.outline,
          ),
        ),
      ],
    );
  }

  Widget _priceRow(String label, String value, {Color? color}) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 13,
              color: color ?? theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Text(
          value,
          textDirection: TextDirection.ltr,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 13,
            fontWeight: color != null
                ? AppDimens.weightBold
                : AppDimens.weightSemiBold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildConfirmBar() {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(
            children: [
              AnimePrimaryButton(
                label: 'تأكيد إرسال الطلب',
                onPressed: _confirm,
                loading: _loading,
                height: AppDimens.buttonHeightXl,
              ),
              const SizedBox(height: 10),
              Text(
                'بالضغط على التأكيد يُرسل طلبك للإدارة للمراجعة، '
                'وراح يتواصلون وياك عبر واتساب.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 11.5,
                  height: 1.6,
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String formatPrice(double price) => '${price.toStringAsFixed(0)} د.ع';
}
