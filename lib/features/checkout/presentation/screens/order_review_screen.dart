import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
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

class _OrderReviewScreenState extends State<OrderReviewScreen>
    with SingleTickerProviderStateMixin {
  bool _loading = false;
  bool _placed = false;

  /// مهلة التروّي قبل تفعيل زرّ التأكيد.
  static const confirmDelay = Duration(seconds: 5);

  /// عدّاد الخمس ثوانٍ — حركةٌ واحدة بطول المهلة يقودها نظام الحركة.
  ///
  /// الشريط يُرسم من قيمتها في **كل إطار** (`AnimatedBuilder` حول شريط
  /// التأكيد وحده)، فلا قفزات كل ثانية ولا إعادة بناء للشاشة كلها؛ والنصّ
  /// والزرّ يُشتقّان من الزمن المنقضي نفسه فلا يتباعد ثلاثتها.
  ///
  /// [CRITICAL] الزمن المنقضي هنا زمنُ الإطارات لا عددُ الدقّات: طوابع
  /// الإطارات ساعةُ النظام الرتيبة، ولا يُعاد ضبط أصلها إلّا عند إعادة
  /// التحميل الحيّ أو تغيير `timeDilation`. حين يذهب التطبيق إلى الخلفية
  /// تتوقّف الإطارات، وأوّل إطارٍ بعد العودة يحمل الزمن الحقيقي كلّه فتكتمل
  /// الحركة فوراً — فلا يبقى الزرّ معطّلاً أطول من خمس ثوانٍ فعلية. ولا
  /// يُعاد ضبطها بإعادة بناء.
  late final AnimationController _countdown = AnimationController(
    vsync: this,
    duration: confirmDelay,
  );

  /// المنقضي من المهلة بزمن الإطارات — صفر قبل أول دقّة، والمهلةُ كاملةً
  /// بعد الاكتمال.
  ///
  /// بالأعداد الصحيحة لا من `value` العشرية: `5 × 0.8` ليست ٤ بالضبط في
  /// الفاصلة العائمة، و`ceil` كان سيُظهر ٥ عند الثانية ٤. و«انقضت المهلة»
  /// تُقاس بها لا بـ`isCompleted` وحدها: المتحكّم يعلن الاكتمال في أول
  /// إطارٍ **بعد** الخمس ثوانٍ لا عندها (والزرّ يُفعَّل عند الخمس بالضبط)،
  /// ثم يُصفّر `lastElapsedDuration` حين يتوقّف — فالاكتمال يعني المهلة كلّها.
  Duration get _elapsed {
    if (_countdown.isCompleted) return confirmDelay;
    return _countdown.lastElapsedDuration ?? Duration.zero;
  }

  /// الثواني المتبقية للعرض — صفر يعني أن الزرّ مفعَّل.
  int get _secondsLeft {
    final left = confirmDelay - _elapsed;
    return left.isNegative ? 0 : (left.inMilliseconds / 1000).ceil();
  }

  bool get _canConfirm => _elapsed >= confirmDelay && !_loading;

  @override
  void initState() {
    super.initState();
    _countdown.forward();
  }

  @override
  void dispose() {
    _countdown.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    // حارس إعادة الدخول: الزرّ يُعطَّل بـ`loading`، لكن النقرة الثانية في
    // الإطار نفسه أو من مسارٍ آخر لا يجوز أن تُنشئ طلباً ثانياً.
    if (_loading || _placed || !_canConfirm) return;
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
          return context.gNow(GenderedStrings.chooseZoneBeforeOrder);
        case 'ZONE_INVALID':
        case 'ZONE_NOT_SUPPORTED':
          return context.strings('zoneInvalidForProvince');
        case 'BIRTHDAY_DISCOUNT_USED':
          return context.strings('birthdayDiscountUsed');
        default:
          return error.message;
      }
    }
    return context.strings('orderSendFailed');
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.orderData;

    // بعد نجاح الإرسال تحلّ صفحة النجاح محلّ الشاشة بالكامل.
    if (_placed) {
      return Scaffold(
        // عمودٌ موسَّط بعرض القراءة على اللوح — القائمة الممتدّة بعرض
        // ١٣٦٦ بكسل تصير صفوفاً فارغة الوسط. لا أثر له على الهاتف.
        body: ResponsiveContentFrame(
          maxWidth: kReadingMaxWidth,
          child: OrderSuccessView(
            onOpenOrders: () {
              context.router.popUntilRoot();
              context.router.push(const OrdersRoute());
            },
            onKeepShopping: () {
              mainNavIndex.value = MainTab.home;
              context.router.popUntilRoot();
            },
          ),
        ),
      );
    }

    // الرجوع أثناء الإرسال محجوب: الطلب قد يُنشأ على الخادم بينما تُترك
    // الشاشة، فيعود المستخدم إلى سلةٍ ما زالت تظهر ممتلئة ويرسل ثانيةً.
    return PopScope(
      canPop: !_loading,
      child: Scaffold(
        body: Column(
          children: [
            OtakuScreenHeader(
              title: context.strings('reviewOrder'),
              subtitle: context.strings('stepTwoOfTwo'),
              onBack: _loading ? () {} : () => context.router.maybePop(),
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
      title: context.strings('deliveryInfo'),
      children: [
        _infoRow(context.strings('province'), data.province),
        _infoRow(context.strings('fullAddress'), data.fullAddress),
        _infoRow(
          context.strings('phoneNumber'),
          data.phone,
          ltr: true,
          last: true,
        ),
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
      title: context.strings.p('orderItemsCount', {
        'count': '${data.items.length}',
      }),
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
                      context.strings.p('quantityValue', {
                        'count': '${data.items[i].quantity}',
                      }),
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
      title: context.strings('priceSummary'),
      children: [
        // المجموع الفرعي مباشرةً — اشتقاقه من الإجمالي صار خاطئاً بعد
        // دخول خصم التوصيل في المعادلة.
        _priceRow(
          context.strings('productsPrice'),
          formatPrice(data.productsTotal),
        ),
        const SizedBox(height: 10),
        _priceRow(
          context.strings('deliveryFee'),
          formatPrice(data.deliveryCost),
        ),
        if (data.deliveryDiscount > 0) ...[
          const SizedBox(height: 10),
          _priceRow(
            context.strings('deliveryDiscount'),
            '-${formatPrice(data.deliveryDiscount)}',
            color: AppColors.success,
          ),
        ],
        if (data.deliveryCost > 0 && data.payableDelivery == 0) ...[
          const SizedBox(height: 10),
          _priceRow(
            '',
            context.strings('freeDelivery'),
            color: AppColors.success,
          ),
        ],
        if (data.discount > 0) ...[
          const SizedBox(height: 10),
          _priceRow(
            context.strings('discount'),
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
                context.strings('finalTotal'),
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
        // سطر «لا تدفع شيئاً قبل وصول الطلب» أُزيل بطلب المنتج — بلا بديل.
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
          // يُعاد بناء شريط التأكيد وحده مع كل إطارٍ من الحركة.
          child: AnimatedBuilder(
            animation: _countdown,
            builder: (context, _) => Column(
              children: [
                // عدّاد الخمس ثوانٍ فوق الزرّ: شريط ينفد بسلاسة ونصٌّ بالباقي،
                // ثم يختفي.
                if (_secondsLeft > 0) ...[
                  // [a11y] حيٌّ في الثانية الأولى فقط: قارئ الشاشة يعلن
                  // «بعد ٥ ثوانٍ» مرةً، ولا يقطع المستخدم بإعلانٍ كل ثانية.
                  // النصّ يبقى في شجرة الدلالات بقيمته الحالية لمن يركّز
                  // عليه، ولا يتغيّر بين إطارات الثانية الواحدة.
                  Semantics(
                    liveRegion: _secondsLeft == confirmDelay.inSeconds,
                    child: Text(
                      context.strings.p('confirmCountdown', {
                        'seconds': '$_secondsLeft',
                      }),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: AppDimens.weightSemiBold,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
AnimeLinearProgress(
                      value: 1 - _countdown.value,
                      height: 5,
                      valueColor: context.themeColors.primaryGradient.colors.first,
                    ),
                  const SizedBox(height: 12),
                ],
                AnimePrimaryButton(
                  label: context.strings('confirmSendOrder'),
                  // معطّل حتى تنقضي المهلة وأثناء الإرسال — لا نقرة مبكّرة
                  // ولا نقرة ثانية.
                  onPressed: _canConfirm ? _confirm : null,
                  loading: _loading,
                  height: AppDimens.buttonHeightXl,
                ),
                const SizedBox(height: 10),
                Text(
                  context.strings('confirmSendOrderNote'),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
                    height: 1.6,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String formatPrice(double price) =>
      context.strings.p('priceIqd', {'amount': price.toStringAsFixed(0)});
}
