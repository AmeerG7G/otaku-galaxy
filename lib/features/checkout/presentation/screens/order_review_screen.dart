import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../orders/domain/entities/order_data.dart';
import '../../../orders/domain/usecases/place_order_usecase.dart';

@RoutePage()
class OrderReviewScreen extends StatefulWidget {
  const OrderReviewScreen({super.key, required this.orderData});

  final OrderData orderData;

  @override
  State<OrderReviewScreen> createState() => _OrderReviewScreenState();
}

class _OrderReviewScreenState extends State<OrderReviewScreen> {
  bool _loading = false;

  Future<void> _confirm() async {
    setState(() => _loading = true);
    try {
      await context.read<PlaceOrderUsecase>()(widget.orderData);
      if (!mounted) return;
      context.read<CartCubit>().clear();
      await _showSuccessDialog();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('تعذر إرسال الطلب. حاول مرة أخرى.'),
          backgroundColor: context.themeColors.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showSuccessDialog() async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        ),
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: context.themeColors.success,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.check_circle,
                color: Colors.white,
                size: AppDimens.iconMd,
              ),
            ),
            SizedBox(width: AppDimens.space3),
            Expanded(
              child: Text(
                'تم إرسال طلبك بنجاح',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: AppDimens.weightBold,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'سيتم التواصل معك عبر WhatsApp\nلتأكيد تفاصيل الطلب.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                height: AppDimens.lineHeightRelaxed,
              ),
            ),
            SizedBox(height: AppDimens.space3),
            Text(
              'بعد التأكيد سيتم تثبيت طلبك\nوإرساله للمعالجة.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: AppDimens.lineHeightRelaxed,
              ),
            ),
            SizedBox(height: AppDimens.space4),
            Container(
              padding: EdgeInsets.all(AppDimens.space4),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    context.themeColors.infoPale,
                    context.themeColors.infoPale.withValues(alpha: 0.5),
                  ],
                ),
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    color: context.themeColors.info,
                    size: AppDimens.iconMd,
                  ),
                  SizedBox(width: AppDimens.space3),
                  Expanded(
                    child: Text(
                      'لا تحتاج لتأكيد الطلب عبر WhatsApp من داخل التطبيق. الإدارة ستتواصل معك.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.info,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          AnimePrimaryButton(
            label: 'حسناً',
            onPressed: () {
              Navigator.of(context).pop();
              context.router.popUntilRoot();
            },
            expanded: true,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final data = widget.orderData;

    return Scaffold(
      appBar: AppBar(title: const Text('مراجعة الطلب'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // معلومات التوصيل
                    _buildDeliveryInfo(data),

                    SizedBox(height: AppDimens.space5),

                    // منتجات الطلب
                    _buildItemsSection(data),

                    SizedBox(height: AppDimens.space5),

                    // ملخص الأسعار
                    _buildPriceSummary(data),
                  ],
                ),
              ),
            ),

            // زر التأكيد
            _buildConfirmButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryInfo(OrderData data) {
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
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    gradient: context.themeColors.primaryGradient,
                    borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  ),
                  child: Icon(
                    Icons.local_shipping_outlined,
                    color: Colors.white,
                    size: AppDimens.iconMd,
                  ),
                ),
                SizedBox(width: AppDimens.space3),
                Text(
                  'معلومات التوصيل',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space4),
            _buildInfoRow(
              icon: Icons.location_on_outlined,
              label: 'المحافظة',
              value: data.province,
            ),
            _buildInfoRow(
              icon: Icons.home_outlined,
              label: 'العنوان الكامل',
              value: data.fullAddress,
            ),
            _buildInfoRow(
              icon: Icons.phone_outlined,
              label: 'رقم الهاتف',
              value: data.phone,
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
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsSection(OrderData data) {
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
                  'منتجات الطلب (${data.items.length})',
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
            itemCount: data.items.length,
            separatorBuilder: (_, _) => Divider(
              height: 1,
              color: Theme.of(context).colorScheme.outlineVariant,
              indent: AppDimens.cardPadding,
              endIndent: AppDimens.cardPadding,
            ),
            itemBuilder: (context, index) {
              final item = data.items[index];
              return Padding(
                padding: EdgeInsets.all(AppDimens.cardPadding),
                child: Row(
                  children: [
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

  Widget _buildPriceSummary(OrderData data) {
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
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    gradient: context.themeColors.accentGradient,
                    borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  ),
                  child: Icon(
                    Icons.receipt_outlined,
                    color: Colors.white,
                    size: AppDimens.iconMd,
                  ),
                ),
                SizedBox(width: AppDimens.space3),
                Text(
                  'ملخص الأسعار',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space4),
            _buildPriceRow(
              'سعر المنتجات',
              formatPrice(data.total - data.deliveryCost),
            ),
            _buildPriceRow(
              'تكلفة التوصيل',
              formatPrice(data.deliveryCost),
              valueColor: Theme.of(context).colorScheme.primary,
            ),
            if (data.discount > 0)
              _buildPriceRow(
                'الخصم',
                '-${formatPrice(data.discount)}',
                valueColor: context.themeColors.success,
              ),
            Divider(
              height: AppDimens.space4,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            _buildPriceRow(
              'المجموع النهائي',
              formatPrice(data.total),
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
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontWeight: isTotal
                  ? AppDimens.weightExtraBold
                  : AppDimens.weightSemiBold,
              color: valueColor ?? Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConfirmButton() {
    return Container(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.surface,
            Theme.of(context).colorScheme.surfaceContainerHighest,
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        border: Border(
          top: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant,
            width: AppDimens.cardBorderWidth,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: context.themeColors.shadowLight,
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            AnimePrimaryButton(
              label: 'تأكيد إرسال الطلب',
              onPressed: _confirm,
              loading: _loading,
              icon: Icons.send_outlined,
              iconPosition: IconPosition.start,
              height: AppDimens.buttonHeightXl,
              gradient: LinearGradient(
                colors: [
                  context.themeColors.success,
                  context.themeColors.successLight,
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            SizedBox(height: AppDimens.space3),
            Text(
              'بالضغط على زر التأكيد، سيتم إرسال طلبك إلى الإدارة للمراجعة والتواصل معك عبر WhatsApp',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}
