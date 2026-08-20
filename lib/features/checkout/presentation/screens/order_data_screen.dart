import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../cart/presentation/cubit/cart_state.dart';
import '../../../orders/domain/entities/order_data.dart';
import '../../../products/domain/entities/governorate.dart';
import '../../../products/domain/usecases/fetch_governorates_usecase.dart';

@RoutePage()
class OrderDataScreen extends StatefulWidget {
  const OrderDataScreen({super.key});

  @override
  State<OrderDataScreen> createState() => _OrderDataScreenState();
}

class _OrderDataScreenState extends State<OrderDataScreen> {
  final _addressController = TextEditingController();
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  String? _governorateId;
  String? _province;
  double? _deliveryCost;
  static const double _discount = 0;

  List<Governorate>? _governorates;
  bool _loadingGovernorates = false;
  String? _governoratesError;

  @override
  void initState() {
    super.initState();
    _loadGovernorates();
  }

  @override
  void dispose() {
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadGovernorates() async {
    setState(() {
      _loadingGovernorates = true;
      _governoratesError = null;
    });
    try {
      final items = await context.read<FetchGovernoratesUsecase>().call();
      if (!mounted) return;
      setState(() => _governorates = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _governoratesError = e.toString());
    } finally {
      if (mounted) setState(() => _loadingGovernorates = false);
    }
  }

  void _continue() {
    if (!_formKey.currentState!.validate()) return;

    final items = context.read<CartCubit>().state.items;
    final orderData = OrderData(
      governorateId: _governorateId ?? '',
      province: _province ?? '',
      deliveryCost: _deliveryCost ?? 0,
      fullAddress: _addressController.text,
      phone: _phoneController.text,
      items: items,
      discount: _discount,
    );
    context.router.push(OrderReviewRoute(orderData: orderData));
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final deliveryCost = _deliveryCost ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('بيانات الطلب'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // قسم بيانات التوصيل
                      _buildDeliverySection(),

                      SizedBox(height: AppDimens.space6),

                      // ملخص الطلب
                      BlocBuilder<CartCubit, CartState>(
                        builder: (context, state) {
                          final subtotal = state.total;
                          final total = subtotal + deliveryCost - _discount;
                          return _buildOrderSummary(
                            subtotal,
                            deliveryCost,
                            total,
                          );
                        },
                      ),

                      SizedBox(height: AppDimens.space3),
                    ],
                  ),
                ),
              ),

              // زر الاستمرار
              BlocBuilder<CartCubit, CartState>(
                builder: (context, state) {
                  final total = state.total + deliveryCost - _discount;
                  return _buildContinueButton(total);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDeliverySection() {
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
                  'بيانات التوصيل',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space5),

            // المحافظة
            AnimeTextField(
              label: 'المحافظة',
              hint: 'اختر المحافظة',
              prefixIcon: Icons.location_on_outlined,
              readOnly: true,
              controller: TextEditingController(text: _province ?? ''),
              onTap: () => _showProvincePicker(),
              validator: (value) {
                if (_province == null) return 'يرجى اختيار المحافظة';
                return null;
              },
            ),

            SizedBox(height: AppDimens.space4),

            // تكلفة التوصيل
            if (_deliveryCost != null)
              Container(
                padding: EdgeInsets.all(AppDimens.space4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      context.themeColors.successPale,
                      context.themeColors.successPale.withValues(alpha: 0.5),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  border: Border.all(
                    color: context.themeColors.success.withValues(alpha: 0.3),
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.local_shipping,
                      color: context.themeColors.success,
                      size: AppDimens.iconMd,
                    ),
                    SizedBox(width: AppDimens.space3),
                    Text(
                      'تكلفة التوصيل إلى $_province: ',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    Text(
                      formatPrice(_deliveryCost!),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: AppDimens.weightBold,
                        color: context.themeColors.success,
                      ),
                    ),
                  ],
                ),
              ),

            SizedBox(height: AppDimens.space4),

            // العنوان الكامل
            AnimeTextField(
              controller: _addressController,
              label: 'العنوان الكامل',
              hint: 'أدخل العنوان بالتفصيل (الحي، الشارع، رقم المبنى...)',
              prefixIcon: Icons.home_outlined,
              maxLines: 3,
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'يرجى إدخال العنوان الكامل';
                }
                if (value.trim().length < 10) {
                  return 'العنوان قصير جداً';
                }
                return null;
              },
            ),

            SizedBox(height: AppDimens.space4),

            // رقم الهاتف
            AnimeTextField(
              controller: _phoneController,
              label: 'رقم الهاتف',
              hint: 'مثال: 07xxxxxxxx',
              prefixIcon: Icons.phone_outlined,
              keyboardType: TextInputType.phone,
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'يرجى إدخال رقم الهاتف';
                }
                if (value.trim().length < 10) {
                  return 'رقم الهاتف غير صحيح';
                }
                return null;
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderSummary(
    double subtotal,
    double deliveryCost,
    double total,
  ) {
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
                  'ملخص الطلب',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space4),

            // المنتجات
            ...context.read<CartCubit>().state.items.map(
              (item) => Padding(
                padding: EdgeInsets.only(bottom: AppDimens.space3),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                        color: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
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
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: AppDimens.weightSemiBold,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            Divider(
              height: AppDimens.space4,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),

            // الأسعار
            _buildPriceRow('سعر المنتجات', formatPrice(subtotal)),
            _buildPriceRow(
              'تكلفة التوصيل',
              formatPrice(deliveryCost),
              valueColor: Theme.of(context).colorScheme.primary,
            ),
            if (_discount > 0)
              _buildPriceRow(
                'الخصم',
                '-${formatPrice(_discount)}',
                valueColor: context.themeColors.success,
              ),
            Divider(
              height: AppDimens.space4,
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            _buildPriceRow(
              'المجموع النهائي',
              formatPrice(total),
              isTotal: true,
              valueColor: Theme.of(context).colorScheme.primary,
            ),
          ],
        ),
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

  Widget _buildContinueButton(double total) {
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
        child: AnimePrimaryButton(
          label: 'مراجعة الطلب',
          onPressed: _continue,
          icon: Icons.arrow_back_ios,
          iconPosition: IconPosition.end,
          height: AppDimens.buttonHeightXl,
        ),
      ),
    );
  }

  void _showProvincePicker() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        minChildSize: 0.4,
        builder: (context, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.vertical(
              top: Radius.circular(AppDimens.radius2xl),
            ),
          ),
          child: Column(
            children: [
              // مقبض السحب
              Container(
                margin: EdgeInsets.only(top: AppDimens.space3),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // عنوان
              Padding(
                padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                child: Row(
                  children: [
                    Text(
                      'اختر المحافظة',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: AppDimens.weightBold,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: Icon(Icons.close, size: AppDimens.iconMd),
                    ),
                  ],
                ),
              ),
              Divider(height: 1),
              // قائمة المحافظات من الخادم
              Expanded(
                child: _loadingGovernorates
                    ? Center(child: CircularProgressIndicator())
                    : _governoratesError != null
                    ? AnimeErrorState(
                        message: 'تعذر تحميل المحافظات — جرّب مجدداً',
                        onAction: _loadGovernorates,
                      )
                    : _governorates == null || _governorates!.isEmpty
                    ? AnimeEmptyState(
                        title: 'لا توجد محافظات',
                        subtitle: 'المحافظات غير متاحة حالياً',
                        icon: Icons.location_off_outlined,
                      )
                    : ListView.builder(
                        controller: scrollController,
                        padding: EdgeInsets.all(
                          AppDimens.screenHorizontalPadding,
                        ),
                        itemCount: _governorates!.length,
                        itemBuilder: (context, index) {
                          final governorate = _governorates![index];
                          final isSelected = _governorateId == governorate.id;
                          final cost = governorate.deliveryFee;

                    return ListTile(
                      onTap: () {
                        setState(() {
                          _governorateId = governorate.id;
                          _province = governorate.name;
                          _deliveryCost = cost;
                        });
                        Navigator.of(context).pop();
                      },
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: isSelected
                              ? context.themeColors.primaryGradient
                              : null,
                          color: isSelected
                              ? null
                              : Theme.of(
                                  context,
                                ).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusMd,
                          ),
                          border: Border.all(
                            color: isSelected
                                ? Colors.transparent
                                : Theme.of(context).colorScheme.outlineVariant,
                            width: AppDimens.cardBorderWidth,
                          ),
                        ),
                        child: Icon(
                          Icons.location_on,
                          color: isSelected
                              ? Colors.white
                              : Theme.of(context).colorScheme.onSurfaceVariant,
                          size: AppDimens.iconMd,
                        ),
                      ),
                      title: Text(
                        governorate.name,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: isSelected
                              ? AppDimens.weightBold
                              : AppDimens.weightRegular,
                        ),
                      ),
                      subtitle: Text(
                        'تكلفة التوصيل: ${formatPrice(cost)}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      trailing: isSelected
                          ? Icon(
                              Icons.check_circle,
                              color: Theme.of(context).colorScheme.primary,
                            )
                          : null,
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}
