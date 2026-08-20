import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../branding/otaku_store_logo.dart';

class AnimeProductCard extends StatelessWidget {
  const AnimeProductCard({
    super.key,
    required this.product,
    this.onTap,
    this.onFavoriteToggle,
    this.isFavorite = false,
    this.width = AppDimens.productCardWidth,
  });

  final dynamic product;
  final VoidCallback? onTap;
  final VoidCallback? onFavoriteToggle;
  final bool isFavorite;
  final double width;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SizedBox(
      width: width,
      child: Card(
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _ProductArtwork(product: product),
                    PositionedDirectional(
                      top: AppDimens.space3,
                      start: AppDimens.space3,
                      child: _ActionIcon(
                        icon: isFavorite
                            ? Icons.favorite
                            : Icons.favorite_border,
                        color: isFavorite ? colors.error : Colors.white,
                        background: Colors.black.withValues(alpha: 0.34),
                        onTap: onFavoriteToggle,
                      ),
                    ),
                    if (product.categoryName != null)
                      PositionedDirectional(
                        top: AppDimens.space3,
                        end: AppDimens.space3,
                        child: _CategoryTag(label: product.categoryName),
                      ),
                    if (!product.inStock)
                      const Positioned.fill(
                        child: ColoredBox(color: Color(0x990B0816)),
                      ),
                    if (!product.inStock)
                      const Center(child: _StockLabel(label: 'نفدت الكمية')),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppDimens.space4,
                  AppDimens.space3,
                  AppDimens.space3,
                  AppDimens.space3,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: AppDimens.weightBold,
                      ),
                    ),
                    const SizedBox(height: AppDimens.space1),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${product.price.toStringAsFixed(0)} د.ع',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelLarge
                                ?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontWeight: AppDimens.weightExtraBold,
                                ),
                          ),
                        ),
                        if (product.rating != null) ...[
                          Icon(
                            Icons.star_rounded,
                            size: AppDimens.iconXs,
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: AppDimens.space1),
                          Text(
                            product.rating!.toStringAsFixed(1),
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                  fontWeight: AppDimens.weightBold,
                                ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProductArtwork extends StatelessWidget {
  const _ProductArtwork({required this.product});

  final dynamic product;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final imageUrl = product.images is List && product.images.isNotEmpty
        ? product.images.first as String
        : null;

    return DecoratedBox(
      decoration: BoxDecoration(gradient: colors.animeHeroGradient),
      child: imageUrl == null || imageUrl.isEmpty
          ? Stack(
              alignment: Alignment.center,
              children: [
                PositionedDirectional(
                  top: -AppDimens.space8,
                  end: -AppDimens.space7,
                  child: Icon(
                    Icons.auto_awesome,
                    size: AppDimens.iconHero * 1.7,
                    color: Colors.white.withValues(alpha: 0.12),
                  ),
                ),
                Opacity(
                  opacity: 0.94,
                  child: OtakuStoreLogoSimple(size: AppDimens.iconHero),
                ),
              ],
            )
          : Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) =>
                  Center(child: OtakuStoreLogoSimple(size: AppDimens.iconHero)),
            ),
    );
  }
}

class _ActionIcon extends StatelessWidget {
  const _ActionIcon({
    required this.icon,
    required this.color,
    required this.background,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(icon, color: color, size: AppDimens.iconMd),
        ),
      ),
    );
  }
}

class _CategoryTag extends StatelessWidget {
  const _CategoryTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimens.space2,
        vertical: AppDimens.space1,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: AppColors.primaryDark,
          fontWeight: AppDimens.weightBold,
        ),
      ),
    );
  }
}

class _StockLabel extends StatelessWidget {
  const _StockLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppDimens.space3,
        vertical: AppDimens.space2,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: AppColors.error,
          fontWeight: AppDimens.weightBold,
        ),
      ),
    );
  }
}
