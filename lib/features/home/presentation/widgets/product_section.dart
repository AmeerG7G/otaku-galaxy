import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../products/domain/entities/product.dart';
import 'product_card.dart';

class ProductSection extends StatelessWidget {
  const ProductSection({
    super.key,
    required this.title,
    required this.products,
    this.onTapCategory,
    this.showBadge = false,
    this.badgeType,
  });

  final String title;
  final List<Product> products;
  final void Function(String id, String name)? onTapCategory;
  final bool showBadge;
  final BadgeType? badgeType;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppDimens.screenHorizontalPadding,
            AppDimens.space6,
            AppDimens.screenHorizontalPadding,
            AppDimens.space3,
          ),
          child: Row(
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: AppDimens.weightBold,
                ),
              ),
              if (showBadge && badgeType != null) ...[
                SizedBox(width: AppDimens.space3),
                AnimeProductBadge(
                  label: _getBadgeLabel(badgeType!),
                  type: badgeType!,
                  size: BadgeSize.small,
                ),
              ],
              const Spacer(),
              if (onTapCategory != null)
                AnimeTextButton(
                  label: 'عرض الكل',
                  onPressed: () => onTapCategory?.call('', ''),
                  icon: Icons.arrow_back_ios,
                  iconPosition: IconPosition.end,
                ),
            ],
          ),
        ),
        if (products.isNotEmpty)
          SizedBox(
            height: 240,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.symmetric(
                horizontal: AppDimens.screenHorizontalPadding,
              ),
              itemCount: products.length,
              separatorBuilder: (_, _) => SizedBox(width: AppDimens.space3),
              itemBuilder: (context, index) {
                return ProductCard(
                  product: products[index],
                  showBadge: showBadge,
                  badgeType: badgeType,
                );
              },
            ),
          )
        else if (onTapCategory != null)
          Padding(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            child: AnimeEmptyState(
              title: 'لا توجد منتجات',
              subtitle: 'لا توجد منتجات في هذا القسم حالياً',
              icon: Icons.inventory_2_outlined,
              actionLabel: 'تصفح الأقسام',
              onAction: () => onTapCategory?.call('', ''),
              iconSize: AppDimens.iconLg,
            ),
          ),
      ],
    );
  }

  String _getBadgeLabel(BadgeType type) {
    switch (type) {
      case BadgeType.offer:
        return 'عرض';
      case BadgeType.newArrival:
        return 'جديد';
      case BadgeType.featured:
        return 'مختار';
      case BadgeType.lowStock:
        return 'كمية قليلة';
      case BadgeType.bestSeller:
        return 'الأكثر مبيعاً';
      default:
        return '';
    }
  }
}
