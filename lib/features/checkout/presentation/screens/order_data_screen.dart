import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../birthday/presentation/widgets/birthday_discount_card.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../cart/presentation/cubit/cart_state.dart';
import '../../../orders/domain/entities/order_data.dart';
import '../../../products/domain/entities/governorate.dart';
import '../../../products/domain/usecases/fetch_governorates_usecase.dart';
import '../../../birthday/data/birthday_storage.dart';
import '../../../../core/di/injection_container.dart';

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
  /// خصم عيد الميلاد كما يقرّره الخادم. هذه معاينة للعرض فقط — الخادم
  /// يعيد حسابه وتطبيقه عند إنشاء الطلب، والتطبيق لا يمنح خصماً أبداً.
  double _discountFor(double productsTotal) {
    final birthday = sl<BirthdayStorage>();
    if (!birthday.isRewardAvailable) return 0;
    return (productsTotal * birthday.discountPercent / 100).roundToDouble();
  }

  // مناطق التوصيل تأتي من الخادم لكل محافظة. متى وُجدت مناطق، صار اختيار
  // المنطقة إلزامياً ورسمها هو المحتسب بدل رسم المحافظة — القائمة تبدأ
  // فارغة ولا يمكن المتابعة دون اختيار صريح.
  List<DeliveryZone> _zones = const [];
  DeliveryZone? _selectedZone;
  bool _loadingZones = false;
  bool get _hasZones => _zones.isNotEmpty;
  bool get _zoneMissing => _hasZones && _selectedZone == null;

  /// تُرفع بعد أول ضغطة «متابعة» فقط، فلا تُصبَغ الحقول بالأحمر قبل أن
  /// يحاول المستخدم المتابعة.
  bool _submitted = false;

  bool get _governorateMissing => _governorateId == null;

  /// تعذّر جلب مناطق المحافظة. «فشل الجلب» ليس «لا توجد مناطق»: الخلط
  /// بينهما كان يُمرّر طلب النجف بلا منطقة، فيرفضه الخادم بـZONE_REQUIRED
  /// بعد أن يكون العميل قد ملأ كل شيء.
  bool _zonesFailed = false;

  /// رسم التوصيل المعروض. للمحافظات المقسّمة مناطق لا يُعرض أي رقم قبل
  /// اختيار المنطقة — الرسم يختلف بينها، فإظهار رسم المحافظة هنا يوهم
  /// العميل بسعر قد لا يدفعه. القيمة النهائية يحسبها الخادم دائماً.
  double? get _effectiveDeliveryCost =>
      _hasZones ? _selectedZone?.deliveryFee : _deliveryCost;

  List<Governorate>? _governorates;
  bool _loadingGovernorates = false;
  String? _governoratesError;

  @override
  void initState() {
    super.initState();
    _loadGovernorates();
    // نُحدّث حالة الميلاد من الخادم حتى لا نعرض خصماً استُهلك على جهاز آخر.
    sl<BirthdayStorage>().refresh().then((_) {
      if (mounted) setState(() {});
    });
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

  /// يحمّل مناطق المحافظة المختارة ويصفّر الاختيار السابق.
  Future<void> _loadZones(String governorateId) async {
    setState(() {
      _loadingZones = true;
      _zones = const [];
      _selectedZone = null;
      _zonesFailed = false;
    });
    try {
      final zones = await context
          .read<FetchGovernoratesUsecase>()
          .zones(governorateId);
      if (!mounted) return;
      setState(() => _zones = zones);
    } catch (_) {
      // لا نعرف إن كانت هذه المحافظة مقسّمة مناطق أم لا، فلا نُكمل بصمت.
      if (!mounted) return;
      setState(() {
        _zones = const [];
        _zonesFailed = true;
      });
    } finally {
      if (mounted) setState(() => _loadingZones = false);
    }
  }

  void _continue() {
    final formValid = _formKey.currentState!.validate();
    // إعادة تقييم فورية لتظهر رسائل الحقول الناقصة فوراً عند الضغط.
    setState(() => _submitted = true);
    // المحافظة والمنطقة صفّا اختيار لا حقلا نموذج، فلا يفحصهما
    // `Form.validate()`. بدون هذا الحارس كان الطلب يُرسَل بـ
    // `governorateId: ''` فيرفضه الخادم بـ400 «اختر محافظة صالحة»،
    // ويظهر للعميل «تعذر إرسال الطلب» بلا سبب مفهوم.
    if (!formValid || _governorateMissing || _zoneMissing || _zonesFailed) {
      return;
    }

    final cart = context.read<CartCubit>().state;
    final items = cart.items;
    // رسم المنطقة يسبق رسم المحافظة متى وُجدت مناطق.
    final effectiveDelivery =
        _selectedZone?.deliveryFee ?? _deliveryCost ?? 0;

    final orderData = OrderData(
      governorateId: _governorateId ?? '',
      province: _province ?? '',
      deliveryCost: effectiveDelivery,
      fullAddress: _addressController.text.trim(),
      phone: _phoneController.text,
      items: items,
      discount: _discountFor(
        items.fold<double>(0, (sum, item) => sum + item.lineTotal),
      ),
      // معاينة فقط — الخادم يعيد حساب الخصم عند الإنشاء بنفس القاعدة.
      deliveryDiscount: cart.deliveryDiscountFor(effectiveDelivery),
      zoneId: _selectedZone?.id,
      zoneName: _selectedZone?.name,
    );
    context.router.push(OrderReviewRoute(orderData: orderData));
  }

  @override
  Widget build(BuildContext context) {
    final deliveryCost = _effectiveDeliveryCost ?? 0;

    return Scaffold(
      body: Form(
        key: _formKey,
        child: Column(
          children: [
            OtakuScreenHeader(
              title: 'بيانات الطلب',
              subtitle: 'الخطوة ١ من ٢',
              onBack: () => context.router.maybePop(),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // قسم بيانات التوصيل
                    _buildDeliverySection(),

                    const SizedBox(height: 13),

                    // خصم عيد الميلاد — يظهر فقط يوم الميلاد وقبل استخدامه.
                    const BirthdayDiscountCard(),

                    // ملخص الطلب
                    BlocBuilder<CartCubit, CartState>(
                      builder: (context, state) {
                        final subtotal = state.total;
                        final deliveryDiscount = state.deliveryDiscountFor(
                          deliveryCost,
                        );
                        final total =
                            subtotal +
                            (deliveryCost - deliveryDiscount) -
                            _discountFor(subtotal);
                        return _buildOrderSummary(
                          subtotal,
                          deliveryCost,
                          total,
                          deliveryDiscount,
                        );
                      },
                    ),

                    const SizedBox(height: 13),
                  ],
                ),
              ),
            ),

            // زر الاستمرار
            BlocBuilder<CartCubit, CartState>(
              builder: (context, state) {
                final total =
                    state.total +
                    (deliveryCost - state.deliveryDiscountFor(deliveryCost)) -
                    _discountFor(state.total);
                return _buildContinueButton(total);
              },
            ),
          ],
        ),
      ),
    );
  }

  /// بطاقة قسم v2: سطح عائم بنصف قطر ٢٢ يبدأ بعنوان Tajawal ثقيل بداخله.
  Widget _v2Card({required String title, required List<Widget> children}) {
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

  /// صف اختيار (المحافظة/المنطقة) — سطح داخلي قابل للنقر مع قيمة ورسم سهم.
  Widget _pickerRow({
    required String label,
    required String? value,
    required String placeholder,
    required VoidCallback onTap,
    String? trailingNote,
    String? errorText,
  }) {
    final hasError = errorText != null;
    final colors = context.themeColors;
    final empty = value == null || value.trim().isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontSize: 12.5,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Material(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                border: Border.all(
                  color: hasError
                      ? colors.error
                      : Theme.of(context).colorScheme.outlineVariant,
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      empty ? placeholder : value,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontSize: 14,
                        fontWeight: empty
                            ? AppDimens.weightRegular
                            : AppDimens.weightSemiBold,
                        color: empty
                            ? Theme.of(context).colorScheme.onSurfaceVariant
                            : Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  ),
                  if (trailingNote != null) ...[
                    Text(
                      trailingNote,
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        fontWeight: AppDimens.weightExtraBold,
                        color: AppColors.secondary,
                      ),
                    ),
                    const SizedBox(width: AppDimens.space3),
                  ],
                  Icon(
                    Icons.expand_more_rounded,
                    size: AppDimens.iconMd,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (errorText != null) ...[
          const SizedBox(height: 6),
          Text(
            errorText,
            style: Theme.of(
              context,
            ).textTheme.labelSmall?.copyWith(color: colors.error),
          ),
        ],
      ],
    );
  }

  Widget _buildDeliverySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ── معلومات المستلم ──
        _v2Card(
          title: 'معلومات المستلم',
          children: [
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

        const SizedBox(height: 18),

        // ── عنوان التوصيل ──
        _v2Card(
          title: 'عنوان التوصيل',
          children: [
            _pickerRow(
              label: 'المحافظة',
              value: _province,
              placeholder: 'اختر المحافظة',
              trailingNote: !_hasZones && _deliveryCost != null
                  ? formatPrice(_deliveryCost!)
                  : null,
              errorText: _submitted && _governorateMissing
                  ? 'يرجى اختيار المحافظة'
                  : null,
              onTap: _showProvincePicker,
            ),

            // تعذّر تحميل المناطق: لا نُكمل بصمت على رسم المحافظة.
            if (_zonesFailed) ...[
              const SizedBox(height: 12),
              _ZonesRetryNotice(onRetry: () {
                final id = _governorateId;
                if (id != null) _loadZones(id);
              }),
            ],

            // منطقة التوصيل — تظهر فقط للمحافظات المقسّمة، وإلزامية عندها.
            if (_hasZones || _loadingZones) ...[
              const SizedBox(height: 16),
              _pickerRow(
                label: 'منطقة التوصيل',
                value: _selectedZone?.name,
                placeholder: _loadingZones ? 'جاري التحميل…' : 'اختر المنطقة',
                trailingNote: _selectedZone != null
                    ? formatPrice(_selectedZone!.deliveryFee)
                    : null,
                errorText: _submitted && _zoneMissing
                    ? 'يرجى تحديد موقع التوصيل داخل أو خارج قضاء النجف'
                    : null,
                onTap: () {
                  if (!_loadingZones) _showZonePicker();
                },
              ),
            ],

            const SizedBox(height: 16),

            AnimeTextField(
              controller: _addressController,
              label: 'العنوان الكامل',
              hint: 'المنطقة، الشارع، أقرب نقطة دالة',
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

            if (_effectiveDeliveryCost != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: context.themeColors.successPale,
                  borderRadius: BorderRadius.circular(AppDimens.radiusSm),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.local_shipping_outlined,
                      size: AppDimens.iconMd,
                      color: context.themeColors.success,
                    ),
                    const SizedBox(width: AppDimens.space3),
                    Expanded(
                      child: Text(
                        _selectedZone != null
                            ? 'التوصيل إلى ${_selectedZone!.name}'
                            : 'التوصيل إلى $_province',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 12.5,
                          fontWeight: AppDimens.weightSemiBold,
                          color: context.themeColors.success,
                        ),
                      ),
                    ),
                    Text(
                      formatPrice(_effectiveDeliveryCost!),
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: AppDimens.weightBlack,
                        color: context.themeColors.success,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildOrderSummary(
    double subtotal,
    double deliveryCost,
    double total,
    double deliveryDiscount,
  ) {
    final colors = context.themeColors;
    final items = context.read<CartCubit>().state.items;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(start: 6, bottom: 10),
          child: Text(
            'ملخص الطلب',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontSize: 12,
              letterSpacing: 0.4,
              fontWeight: AppDimens.weightExtraBold,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            boxShadow: colors.shadowXSoft,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: ProductPhotoSlot(
                            imageUrl: item.product.images.isNotEmpty
                                ? item.product.images.first
                                : null,
                            showLabel: false,
                            iconSize: 18,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppDimens.space3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.product.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    fontSize: 13,
                                    fontWeight: AppDimens.weightSemiBold,
                                  ),
                            ),
                            Text(
                              'الكمية: ${item.quantity}',
                              style: Theme.of(context).textTheme.labelSmall
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
                        textDirection: TextDirection.ltr,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontWeight: AppDimens.weightBold,
                        ),
                      ),
                    ],
                  ),
                ),
              Divider(color: Theme.of(context).colorScheme.outlineVariant),
              _buildPriceRow('سعر المنتجات', formatPrice(subtotal)),
              _buildPriceRow(
                'التوصيل',
                _effectiveDeliveryCost == null
                    ? (_hasZones
                          ? 'يُحدد بعد اختيار المنطقة'
                          : 'يُحدد بعد اختيار المحافظة')
                    : formatPrice(deliveryCost),
              ),
              if (deliveryDiscount > 0)
                _buildPriceRow(
                  'خصم التوصيل',
                  '-${formatPrice(deliveryDiscount)}',
                  valueColor: colors.success,
                ),
              if (deliveryCost > 0 && deliveryDiscount >= deliveryCost)
                _buildPriceRow(
                  '',
                  'توصيل مجاني 🎉',
                  valueColor: colors.success,
                ),
              if (_discountFor(subtotal) > 0)
                _buildPriceRow(
                  'خصم عيد الميلاد',
                  '-${formatPrice(_discountFor(subtotal))}',
                  valueColor: colors.success,
                ),
              Divider(color: Theme.of(context).colorScheme.outlineVariant),
              _buildPriceRow(
                'المجموع النهائي',
                formatPrice(total),
                isTotal: true,
                valueColor: AppColors.secondary,
              ),
              const SizedBox(height: 10),
              Text(
                'الدفع عند الاستلام — لا يتطلب دفعاً إلكترونياً.',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  height: 1.6,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildPriceRow(
    String label,
    String value, {
    bool isTotal = false,
    Color? valueColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontSize: isTotal ? 16 : 13.5,
              fontWeight: isTotal
                  ? AppDimens.weightExtraBold
                  : AppDimens.weightRegular,
              color: isTotal
                  ? Theme.of(context).colorScheme.onSurface
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              fontFamily: isTotal ? 'Tajawal' : null,
              fontSize: isTotal ? 20 : 13.5,
              fontWeight: isTotal
                  ? AppDimens.weightBlack
                  : AppDimens.weightSemiBold,
              color: valueColor ?? Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  /// شريط سفلي مثبّت: المجموع + زر المتابعة — يبقى ظاهراً أثناء التمرير.
  Widget _buildContinueButton(double total) {
    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'المجموع',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    formatPrice(total),
                    textDirection: TextDirection.ltr,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontFamily: 'Tajawal',
                      fontSize: 20,
                      fontWeight: AppDimens.weightBlack,
                      color: AppColors.secondary,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: AppDimens.space5),
              Expanded(
                child: AnimePrimaryButton(
                  label: 'مراجعة الطلب',
                  onPressed: _continue,
                  height: AppDimens.buttonHeightXl,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// غلاف ورقة سفلية v2 موحّد للاختيارات.
  Future<void> _showV2Sheet({required String title, required Widget child}) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        top: false,
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.78,
          ),
          decoration: BoxDecoration(
            color: Theme.of(sheetContext).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppDimens.radiusXl),
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 14),
              Center(
                child: Container(
                  width: 40,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Theme.of(sheetContext).colorScheme.outlineVariant,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
                child: Text(
                  title,
                  style: Theme.of(sheetContext).textTheme.titleMedium?.copyWith(
                    fontSize: 18,
                    fontWeight: AppDimens.weightBlack,
                  ),
                ),
              ),
              Flexible(child: child),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  /// صف اختيار داخل الورقة — يعرض الاسم وسعر التوصيل وعلامة الاختيار.
  Widget _sheetOption({
    required String label,
    String? trailing,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.secondary.withValues(alpha: 0.10)
                : Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(AppDimens.radiusSm),
            border: Border.all(
              color: selected
                  ? AppColors.secondary
                  : Theme.of(context).colorScheme.outlineVariant,
              width: 1.5,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontSize: 14.5,
                    fontWeight: selected
                        ? AppDimens.weightBold
                        : AppDimens.weightMedium,
                  ),
                ),
              ),
              if (trailing != null)
                Text(
                  trailing,
                  textDirection: TextDirection.ltr,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: AppDimens.weightExtraBold,
                    color: selected
                        ? AppColors.secondary
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              if (selected) ...[
                const SizedBox(width: AppDimens.space3),
                const Icon(
                  Icons.check_circle_rounded,
                  size: 20,
                  color: AppColors.secondary,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// اختيار المحافظة — كل محافظة تعرض سعر توصيلها بوضوح.
  void _showProvincePicker() {
    _showV2Sheet(
      title: 'اختر المحافظة',
      child: _loadingGovernorates
          ? const Padding(
              padding: EdgeInsets.all(40),
              child: Center(child: CircularProgressIndicator()),
            )
          : _governoratesError != null
          ? AnimeErrorState(
              message: 'تعذر تحميل المحافظات — جرّب مجدداً',
              onAction: () {
                Navigator.of(context).pop();
                _loadGovernorates();
              },
            )
          : (_governorates == null || _governorates!.isEmpty)
          ? const AnimeEmptyState(
              title: 'لا توجد محافظات',
              subtitle: 'المحافظات غير متاحة حالياً',
              icon: Icons.location_off_outlined,
            )
          : ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.only(bottom: 8),
              itemCount: _governorates!.length,
              itemBuilder: (context, index) {
                final governorate = _governorates![index];
                return _sheetOption(
                  label: governorate.name,
                  trailing: formatPrice(governorate.deliveryFee),
                  selected: _governorateId == governorate.id,
                  onTap: () {
                    setState(() {
                      _governorateId = governorate.id;
                      _province = governorate.name;
                      _deliveryCost = governorate.deliveryFee;
                    });
                    // اختيار محافظة جديدة يعيد تحميل مناطقها ويصفّر الاختيار.
                    _loadZones(governorate.id);
                    Navigator.of(context).pop();
                  },
                );
              },
            ),
    );
  }

  /// منطقة التوصيل — تبدأ فارغة ولا يمكن إتمام الطلب دون اختيار صريح.
  /// كل منطقة تعرض رسمها الحقيقي القادم من الخادم.
  void _showZonePicker() {
    _showV2Sheet(
      title: 'منطقة التوصيل',
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.only(bottom: 8),
        children: [
          for (final zone in _zones)
            _sheetOption(
              label: zone.name,
              trailing: formatPrice(zone.deliveryFee),
              selected: _selectedZone?.id == zone.id,
              onTap: () {
                setState(() {
                  _selectedZone = zone;
                  _deliveryCost = zone.deliveryFee;
                });
                Navigator.of(context).pop();
              },
            ),
        ],
      ),
    );
  }

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}

/// تنبيه تعذّر تحميل مناطق المحافظة مع إعادة المحاولة.
///
/// المتابعة محجوبة ما دام التحميل فاشلاً: «فشل الجلب» لا يعني «لا مناطق»،
/// والمضيّ على هذا الافتراض يُنتج طلباً يرفضه الخادم بعد ملء كل الحقول.
class _ZonesRetryNotice extends StatelessWidget {
  const _ZonesRetryNotice({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: colors.errorPale,
        borderRadius: BorderRadius.circular(AppDimens.radiusSm),
      ),
      child: Row(
        children: [
          Icon(Icons.wifi_off_rounded, size: 18, color: colors.error),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'تعذّر تحميل مناطق التوصيل لهذه المحافظة.',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: 12,
                height: 1.6,
                color: colors.error,
              ),
            ),
          ),
          AnimeTextButton(label: 'إعادة المحاولة', onPressed: onRetry),
        ],
      ),
    );
  }
}
