import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../favorites/presentation/cubit/favorites_state.dart';
import '../../../products/domain/entities/product.dart';

/// بطاقة منتج ذاتية الاتصال بالمفضلة والتنقل لتفاصيل المنتج.
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    this.onTap,
    this.onFavoriteToggle,
    this.showBadge = false,
    this.badgeType,
  });

  final Product product;
  final VoidCallback? onTap;
  final VoidCallback? onFavoriteToggle;
  final bool showBadge;
  final BadgeType? badgeType;

  @override
  Widget build(BuildContext context) {
    return BlocSelector<FavoritesCubit, FavoritesState, bool>(
      selector: (state) => state.isFavorite(product.id),
      builder: (context, isFavorite) => AnimeProductCard(
        product: product,
        isFavorite: isFavorite,
        onTap:
            onTap ??
            () =>
                context.router.push(ProductDetailRoute(productId: product.id)),
        onFavoriteToggle:
            onFavoriteToggle ??
            () => context.read<FavoritesCubit>().toggle(product),
      ),
    );
  }
}
