import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/cart_item.dart';
import '../cubit/cart_cubit.dart';
import '../cubit/cart_state.dart';

@RoutePage()
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('السلة'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: BlocBuilder<CartCubit, CartState>(
          builder: (context, state) {
            return state.items.isEmpty
                ? _buildEmptyCart(context)
                : Column(
                    children: [
                      Expanded(
                        child: ListView.separated(
                          padding: EdgeInsets.all(
                            AppDimens.screenHorizontalPadding,
                          ),
                          itemCount: state.items.length,
                          separatorBuilder: (_, _) =>
                              SizedBox(height: AppDimens.space3),
                          itemBuilder: (context, index) {
                            return _CartItemTile(item: state.items[index]);
                          },
                        ),
                      ),
                      _buildBottomSummary(context, state),
                    ],
                  );
          },
        ),
      ),
    );
  }

  Widget _buildEmptyCart(BuildContext context) {
    return Center(
      child: AnimeEmptyState(
        title: 'السلة فارغة',
        subtitle: 'لم تضف أي منتجات بعد. ابدأ بالتسوق الآن!',
        icon: Icons.shopping_cart_outlined,
        actionLabel: 'تصفح المنتجات',
        onAction: () => context.router.navigate(const HomeRoute()),
        iconSize: AppDimens.iconHero * 1.5,
      ),
    );
  }

  Widget _buildBottomSummary(BuildContext context, CartState cart) {
    final colors = context.themeColors;
    final subtotal = cart.total;

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
            color: colors.shadowLight,
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'المجموع',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightSemiBold,
                  ),
                ),
                Text(
                  _formatPrice(subtotal),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: AppDimens.weightExtraBold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            SizedBox(height: AppDimens.space5),
            AnimePrimaryButton(
              label: 'إتمام الطلب',
              onPressed: () => context.router.push(const OrderDataRoute()),
              icon: Icons.arrow_back_ios,
              iconPosition: IconPosition.end,
              height: AppDimens.buttonHeightXl,
            ),
          ],
        ),
      ),
    );
  }

  String _formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}

class _CartItemTile extends StatelessWidget {
  const _CartItemTile({required this.item});

  final CartItem item;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cart = context.read<CartCubit>();

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
        child: Row(
          children: [
            // صورة المنتج
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                child: item.product.images.isNotEmpty
                    ? Image.network(
                        item.product.images.first,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _buildPlaceholder(context),
                      )
                    : _buildPlaceholder(context),
              ),
            ),

            SizedBox(width: AppDimens.space4),

            // تفاصيل المنتج
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.product.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: AppDimens.weightSemiBold,
                    ),
                  ),
                  SizedBox(height: AppDimens.space2),
                  Text(
                    _formatPrice(item.lineTotal),
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: AppDimens.weightBold,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  SizedBox(height: AppDimens.space3),
                  // أدوات التحكم بالكمية
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                      border: Border.all(
                        color: Theme.of(context).colorScheme.outlineVariant,
                        width: AppDimens.cardBorderWidth,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          iconSize: AppDimens.iconSm,
                          onPressed: () => cart.decrease(item.product.id),
                          icon: Icon(Icons.remove, size: AppDimens.iconMd),
                          style: IconButton.styleFrom(
                            foregroundColor: Theme.of(
                              context,
                            ).colorScheme.onSurfaceVariant,
                          ),
                        ),
                        Container(
                          width: 40,
                          alignment: Alignment.center,
                          child: Text(
                            '${item.quantity}',
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: AppDimens.weightBold),
                          ),
                        ),
                        IconButton(
                          iconSize: AppDimens.iconSm,
                          onPressed: () => cart.increase(item.product.id),
                          icon: Icon(Icons.add, size: AppDimens.iconMd),
                          style: IconButton.styleFrom(
                            foregroundColor: Theme.of(
                              context,
                            ).colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            SizedBox(width: AppDimens.space3),

            // زر الحذف
            IconButton(
              onPressed: () => _showDeleteConfirmation(context, item),
              icon: Icon(Icons.delete_outline, size: AppDimens.iconMd),
              style: IconButton.styleFrom(
                backgroundColor: colors.errorPale,
                foregroundColor: colors.error,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceholder(BuildContext context) {
    return Icon(
      Icons.image_outlined,
      size: AppDimens.iconLg,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    );
  }

  Future<void> _showDeleteConfirmation(
    BuildContext context,
    CartItem item,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        ),
        title: Text(
          'حذف المنتج',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        content: Text(
          'هل تريد حذف "${item.product.name}" من السلة؟',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: context.themeColors.error,
            ),
            child: const Text('حذف'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      context.read<CartCubit>().remove(item.product.id);
    }
  }

  String _formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}
