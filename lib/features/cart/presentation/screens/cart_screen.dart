import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../domain/entities/cart_item.dart';
import '../cubit/cart_cubit.dart';
import '../cubit/cart_state.dart';

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
                title: 'السلة',
                subtitle: !isLoggedIn
                    ? 'سجّل الدخول لتبدأ سلتك'
                    : count == 0
                    ? '0 منتجات في السلة'
                    : '$count منتجات في السلة',
              ),
              Expanded(
                child: !isLoggedIn
                    ? AnimeGuestPrompt(
                        title: 'أنت تتصفح كزائر',
                        body:
                            'سجّل الدخول لإضافة منتجات إلى سلتك وإتمام الطلب.',
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
      title: 'السلة فاضية',
      subtitle: 'خذ جولة بالمتجر واختار اللي يعجبك، السلة راح تنتظرك.',
      artwork: 'assets/art/opt/a-luffy-kid.png',
      actionLabel: 'استكشف المنتجات',
      onAction: () => mainNavIndex.value = MainTab.home,
    );
  }

  Widget _buildFilled(BuildContext context, CartState cart) {
    return ListView(
      padding: const EdgeInsets.only(bottom: 104),
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
            label: 'المجموع الفرعي',
            value: '${cart.total.toStringAsFixed(0)} د.ع',
          ),
          const SizedBox(height: 10),
          _SummaryRow(
            label: 'رسوم التوصيل',
            // التوصيل يُحتسب في الخطوة التالية حسب المحافظة والمنطقة.
            valueWidget: Text(
              'يُحتسب عند إدخال العنوان',
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                color: theme.colorScheme.outline,
              ),
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
                  'الإجمالي',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: 16,
                  ),
                ),
              ),
              Text(
                '${cart.total.toStringAsFixed(0)} د.ع',
                textDirection: TextDirection.ltr,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontFamily: 'Tajawal',
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

  /// زرّ إتمام الطلب — رسم شخصية يخرج من خلف الزرّ كما في التصميم.
  Widget _buildCheckoutButton(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
      child: Stack(
        clipBehavior: Clip.none,
        alignment: AlignmentDirectional.centerStart,
        children: [
          PositionedDirectional(
            bottom: 24,
            end: -10,
            child: IgnorePointer(
              child: Image.asset('assets/art/opt/a-i3.png', width: 76),
            ),
          ),
          AnimePrimaryButton(
            label: 'إتمام الطلب',
            onPressed: () => context.router.push(const OrderDataRoute()),
            height: AppDimens.buttonHeightXl,
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, this.value, this.valueWidget});

  final String label;
  final String? value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 13,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        valueWidget ??
            Text(
              value!,
              textDirection: TextDirection.ltr,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13,
                fontWeight: AppDimens.weightBold,
              ),
            ),
      ],
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
    final lineTotal = item.product.price * item.quantity;

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
                        item.product.name,
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
                          color: theme.colorScheme.outline,
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
                        '${lineTotal.toStringAsFixed(0)} د.ع',
                        textDirection: TextDirection.ltr,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontFamily: 'Tajawal',
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
      title: 'إزالة المنتج',
      message: 'راح نشيل «${item.product.name}» من سلتك. تريد تكمل؟',
      confirmLabel: 'إزالة',
      cancelLabel: 'إلغاء',
      destructive: true,
    );
    if (confirmed != true) return;
    await cart.remove(item.product.id, selectedOption: item.selectedOption);
  }
}
