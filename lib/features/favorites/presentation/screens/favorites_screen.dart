import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../products/domain/entities/product.dart';
import '../cubit/favorites_cubit.dart';
import '../cubit/favorites_state.dart';

@RoutePage()
class FavoritesScreen extends StatelessWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: const Text('المفضلة'), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: BlocBuilder<FavoritesCubit, FavoritesState>(
          builder: (context, state) {
            if (state.products.isEmpty) {
              return _buildEmptyFavorites();
            }
            return RefreshIndicator(
              onRefresh: () => context.read<FavoritesCubit>().load(),
              child: CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate((context, index) {
                        final product = state.products[index];
                        return _FavoriteTile(product: product);
                      }, childCount: state.products.length),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: SizedBox(height: AppDimens.space10),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildEmptyFavorites() {
    return Center(
      child: AnimeEmptyState(
        title: 'لا توجد منتجات مفضلة',
        subtitle: 'اضغط على قلب المنتج لإضافته إلى مفضلاتك',
        icon: Icons.favorite_outline,
        actionLabel: 'تصفح المنتجات',
        onAction: () {
          // الانتقال لتبويب الرئيسية في الغلاف الرئيسي.
          mainNavIndex.value = 0;
        },
        iconSize: AppDimens.iconHero * 1.5,
      ),
    );
  }
}

class _FavoriteTile extends StatelessWidget {
  const _FavoriteTile({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Card(
      margin: EdgeInsets.only(bottom: AppDimens.space3),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: InkWell(
        onTap: () =>
            context.router.push(ProductDetailRoute(productId: product.id)),
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
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
                  child: product.images.isNotEmpty
                      ? Image.network(
                          product.images.first,
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
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: AppDimens.weightSemiBold,
                      ),
                    ),
                    SizedBox(height: AppDimens.space2),
                    Row(
                      children: [
                        Text(
                          formatPrice(product.price),
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(
                                fontWeight: AppDimens.weightBold,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                        ),
                        if (product.rating != null) ...[
                          SizedBox(width: AppDimens.space3),
                          Row(
                            children: [
                              Icon(
                                Icons.star_rounded,
                                size: AppDimens.iconXs,
                                color: AppColors.accent,
                              ),
                              SizedBox(width: AppDimens.space1),
                              Text(
                                product.rating!.toStringAsFixed(1),
                                style: Theme.of(context).textTheme.labelSmall
                                    ?.copyWith(
                                      fontWeight: AppDimens.weightSemiBold,
                                    ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              SizedBox(width: AppDimens.space3),

              // زر الحذف
              IconButton(
                onPressed: () =>
                    context.read<FavoritesCubit>().remove(product.id),
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

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}
