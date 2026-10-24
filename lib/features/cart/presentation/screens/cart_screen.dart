import 'dart:math' as math;

import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../products/domain/entities/product.dart';
import '../../domain/entities/cart_item.dart';
import '../cubit/cart_cubit.dart';
import '../cubit/cart_state.dart';
import '../../../visuals/domain/visual_slot.dart';

/// تبويب السلة بتصميم Otaku Galaxy v2.
///
/// ترويسة تبويب كبيرة، ثم بطاقات عناصر بفتحة صورة ٧٤ وعدّاد كمية
/// كبسولي، ثم بطاقة ملخّص، ثم زرّ إتمام متدرّج يخرج من خلفه رسم شخصية.
@RoutePage()
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = context.select<AuthCubit, bool>(
      (cubit) => cubit.state is AuthAuthenticated,
    );

    return SafeArea(
      bottom: false,
      child: BlocBuilder<CartCubit, CartState>(
        builder: (context, state) {
          final count = state.items.fold<int>(0, (sum, i) => sum + i.quantity);

          return Column(
            children: [
              OtakuScreenHeader.tab(
                title: context.strings('navCart'),
                subtitle: !isLoggedIn
                    ? context.g(GenderedStrings.loginToStartCart)
                    : count == 0
                    ? context.strings('cartEmptyCount')
                    : context.strings.p('cartItemsCount', {'count': '$count'}),
              ),
              Expanded(
                child: !isLoggedIn
                    ? AnimeGuestPrompt(
                        title: context.strings('browsingAsGuest'),
                        body:
                            context.g(GenderedStrings.loginToAddToCart),
                        titleTranslations: AppStrings.across('browsingAsGuest'),
                        bodyTranslations:
                            context.gAcross(GenderedStrings.loginToAddToCart),
                        icon: Icons.shopping_cart_outlined,
                        onLogin: () => context.router.push(const LoginRoute()),
                      )
                    : state.items.isEmpty
                    ? _buildEmpty(context)
                    : _buildFilled(context, state),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return AnimeEmptyState(
      title: context.strings('cartEmptyTitle'),
      subtitle: context.g(GenderedStrings.browseAndPick),
      artworkSlot: VisualSlots.emptyCart,
      actionLabel: context.strings('discover'),
      onAction: () => mainNavIndex.value = MainTab.home,
      // السلة والمفضلة موسّطتان: الرسم فوق ثم الزرّ تحته، كلاهما في المنتصف.
      // بقية الشاشات تبقى على التخطيط الجانبي الذي يصفه مرجع التصميم.
      centered: true,
    );
  }

  Widget _buildFilled(BuildContext context, CartState cart) {
    return ListView(
      padding: context.scrollPadding(
        const EdgeInsets.only(bottom: OtakuBottomNav.contentGap),
      ),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
          child: Column(
            children: [
              for (final item in cart.items) ...[
                _CartItemCard(item: item),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
        _buildSummary(context, cart),
        _buildCheckoutButton(context),
      ],
    );
  }

  /// بطاقة ملخّص السلة — المجموع الفرعي، التوصيل، ثم الإجمالي بالوردي.
  Widget _buildSummary(BuildContext context, CartState cart) {
    final theme = Theme.of(context);

    return OtakuPanel(
      margin: const EdgeInsets.fromLTRB(18, 4, 18, 0),
      padding: const EdgeInsets.all(18),
      child: Column(
        children: [
          _SummaryRow(
            label: context.strings('subtotal'),
            labelTranslations: AppStrings.across('subtotal'),
            value: context.strings.p('priceIqd', {'amount': cart.total.toStringAsFixed(0)}),
          ),
          const SizedBox(height: 10),
          _SummaryRow(
            label: context.strings('deliveryFee'),
            labelTranslations: AppStrings.across('deliveryFee'),
            // التوصيل يُحتسب في الخطوة التالية حسب المحافظة والمنطقة.
            value: context.strings('deliveryFeeAtAddress'),
            // سطرٌ يُصغَّر أولاً؛ وسطرٌ ثانٍ محجوز بكل لغة حيث لا تتّسع إحدى
            // ترجماته حتى عند الحدّ (الكردية على ٣٢٠×١٫٣).
            reserveFor: AppStrings.across('deliveryFeeAtAddress'),
            valueStyle: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          Container(
            height: 1,
            margin: const EdgeInsets.symmetric(vertical: 14),
            color: theme.colorScheme.outlineVariant,
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  context.strings('grandTotal'),
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontFamily: AppFonts.heading,
                    fontFamilyFallback: AppFonts.headingFallback,
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: 16,
                  ),
                ),
              ),
              Text(
                context.strings.p('priceIqd', {'amount': cart.total.toStringAsFixed(0)}),
                textDirection: TextDirection.ltr,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontFamily: AppFonts.heading,
                  fontFamilyFallback: AppFonts.headingFallback,
                  fontWeight: AppDimens.weightBlack,
                  fontSize: 19,
                  color: AppColors.secondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// زرّ إتمام الطلب.
  Widget _buildCheckoutButton(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(18, 16, 18, 0),
      child: _CheckoutButton(),
    );
  }
}

/// «إتمام الطلب» — مزامنةٌ أخيرة قبل الدفع (CA-14).
///
/// إن غيّرت المزامنة شيئاً (سعراً، كميةً، منتجاً نفد) يبقى الزبون في السلة
/// ليرى ما تغيّر — الرسالة يعرضها `CartAutoSync` — ويضغط ثانيةً عن علم.
/// وإن تعذّر الوصول يمضي كما كان: الإرسال يتحقّق على الخادم في كل حال.
class _CheckoutButton extends StatefulWidget {
  const _CheckoutButton();

  @override
  State<_CheckoutButton> createState() => _CheckoutButtonState();
}

class _CheckoutButtonState extends State<_CheckoutButton> {
  bool _busy = false;

  Future<void> _checkout() async {
    if (_busy) return;
    setState(() => _busy = true);
    final router = context.router;
    final notice = await context.read<CartCubit>().sync();
    if (!mounted) return;
    setState(() => _busy = false);
    if (notice != null && notice.hasChanges) return;
    await router.push(const OrderDataRoute());
  }

  @override
  Widget build(BuildContext context) => AnimePrimaryButton(
    label: context.strings('checkout'),
    loading: _busy,
    onPressed: _checkout,
    height: AppDimens.buttonHeightXl,
  );
}

/// سطرٌ في ملخّص السلة: تسميةٌ عند البداية وقيمةٌ عند النهاية.
///
/// [CRITICAL] (2026-10-05) التسمية والقيمة منطقتا `BoundedText`، والقيمة لا
/// تأخذ ما تحتاجه التسمية ([labelTranslations]) ولا الفاصل بينهما: «لە کاتی نووسینی ناونیشان دیاری
/// دەکرێت» الكردية كانت تأخذ عرضها كاملاً فتلتفّ التسمية تحتها وتطول البطاقة
/// (+٢٥ عند ×١٫٣، +٢٢٥ وتجاوزٌ عند ٣٢٠×١٫٣).
class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.labelTranslations = const [],
    this.valueStyle,
    this.reserveFor = const [],
  });

  final String label;
  final String value;

  /// نمط القيمة؛ الافتراضي رقمٌ عريض من اليسار إلى اليمين (مبلغ).
  final TextStyle? valueStyle;

  /// ترجمات القيمة حين تكون نصّاً لا مبلغاً (`BoundedText.reserveFor`).
  final List<String> reserveFor;

  /// ترجمات التسمية بكل اللغات: القيمة تأخذ كل ما لا تحتاجه أعرضُها عند
  /// الحدّ الأدنى — قياسٌ لا نسبةٌ ثابتة (نسبةٌ تتّسع لـ٣٢٠ تحجز سطراً
  /// ثانياً بلا داعٍ على ٤١٢×١٫٣، والعكس يقصّ التسمية).
  final List<String> labelTranslations;

  static const double _gap = 12;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAmount = valueStyle == null;
    final labelStyle = theme.textTheme.bodyMedium?.copyWith(
      fontSize: 13,
      color: theme.colorScheme.onSurfaceVariant,
    );
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    double labelNeed() {
      // يُقاس بمقاس الحدّ نفسه كما يقيس `BoundedText` (عرض الخطّ لا يتناسب
      // مع المقاس تماماً)، ويُقرَّب لأعلى ببكسل.
      final base = DefaultTextStyle.of(context).style.merge(labelStyle);
      final atFloor = base.copyWith(
        fontSize: (base.fontSize ?? 14) * kBoundedTextMinScale,
      );
      var widest = 0.0;
      for (final text in [label, ...labelTranslations]) {
        final painter = TextPainter(
          text: TextSpan(text: text, style: atFloor),
          textScaler: scaler,
          textDirection: direction,
          maxLines: 1,
        )..layout();
        widest = math.max(widest, painter.width);
        painter.dispose();
      }
      return widest.ceilToDouble() + 1;
    }

    return LayoutBuilder(
      builder: (context, constraints) => Row(
        children: [
          Expanded(child: BoundedText(label, style: labelStyle)),
          const SizedBox(width: _gap),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: math.max(
                0,
                constraints.maxWidth - _gap - labelNeed(),
              ),
            ),
            child: Directionality(
              textDirection: isAmount
                  ? TextDirection.ltr
                  : Directionality.of(context),
              child: BoundedText(
                value,
                maxLines: 2,
                reserveFor: reserveFor,
                alignment: AlignmentDirectional.topStart,
                style:
                    valueStyle ??
                    theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13,
                      fontWeight: AppDimens.weightBold,
                    ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// بطاقة عنصر في السلة — فتحة صورة، اسم، سعر السطر، وعدّاد كمية.
class _CartItemCard extends StatelessWidget {
  const _CartItemCard({required this.item});

  final CartItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cart = context.read<CartCubit>();
    final option = item.selectedOption;
    // من الخادم — بعد عرض القطعتين (085) — لا السعر × الكمية.
    final lineTotal = item.lineTotal;

    return OtakuPanel(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 74,
            height: 74,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppDimens.radiusSm),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            clipBehavior: Clip.antiAlias,
            child: ProductPhotoSlot(
              imageUrl: item.product.images.isNotEmpty
                  ? item.product.images.first
                  : null,
              showLabel: false,
              iconSize: 24,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        localizedProductName(item.product, context.language),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13.5,
                          height: 1.5,
                          fontWeight: AppDimens.weightSemiBold,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // إزالة العنصر — حبر هادئ لا ينافس السعر بصرياً.
                    InkWell(
                      onTap: () => _confirmRemove(context, item),
                      customBorder: const CircleBorder(),
                      child: Padding(
                        padding: const EdgeInsets.all(3),
                        child: Icon(
                          Icons.close_rounded,
                          size: 17,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
                if (option != null && option.trim().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                    ),
                    child: Text(
                      option,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 10.5,
                        fontWeight: AppDimens.weightBold,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        context.strings.p('priceIqd', {'amount': lineTotal.toStringAsFixed(0)}),
                        textDirection: TextDirection.ltr,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontFamily: AppFonts.heading,
                          fontFamilyFallback: AppFonts.headingFallback,
                          fontWeight: AppDimens.weightExtraBold,
                          fontSize: 14.5,
                          color: AppColors.secondary,
                        ),
                      ),
                    ),
                    OtakuQuantityStepper(
                      quantity: item.quantity,
                      canIncrease: item.quantity < item.product.stock,
                      onIncrease: () => cart.increase(
                        item.product.id,
                        selectedOption: item.selectedOption,
                      ),
                      onDecrease: () => cart.decrease(
                        item.product.id,
                        selectedOption: item.selectedOption,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmRemove(BuildContext context, CartItem item) async {
    final cart = context.read<CartCubit>();
    final confirmed = await showOtakuConfirm(
      context: context,
      title: context.strings('removeProduct'),
      message: context.strings.p('removeProductConfirm', {'name': localizedProductName(item.product, context.language)}),
      confirmLabel: context.strings('remove'),
      cancelLabel: context.strings('cancel'),
      destructive: true,
    );
    if (confirmed != true) return;
    await cart.remove(item.product.id, selectedOption: item.selectedOption);
  }
}
