import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';

class AnimeCategoryCard extends StatelessWidget {
  const AnimeCategoryCard({
    super.key,
    required this.category,
    this.onTap,
    this.size = AppDimens.categoryCardSize,
  });

  final dynamic category; // Category entity
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final categoryColor =
        AppColors.categoryColors[category.name] ?? AppColors.primary;
    final imageUrl = category.imageUrl as String?;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppDimens.radiusXl),
          border: Border.all(color: categoryColor.withValues(alpha: 0.3)),
          boxShadow: [
            BoxShadow(
              color: categoryColor.withValues(alpha: 0.18),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (imageUrl != null && imageUrl.isNotEmpty)
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _fallback(categoryColor),
              )
            else
              _fallback(categoryColor),
            // تظليل سفلي لإبراز اسم القسم
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppDimens.space2,
                  vertical: AppDimens.space1 + 4,
                ),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.black54, Colors.transparent],
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                  ),
                ),
                child: Text(
                  category.name,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _fallback(Color categoryColor) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [categoryColor, categoryColor.withValues(alpha: 0.7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Icon(
          _getCategoryIcon(category.name),
          size: AppDimens.categoryIconSize * 1.5,
          color: Colors.white,
        ),
      ),
    );
  }

  IconData _getCategoryIcon(String name) {
    switch (name) {
      case 'ملابس':
        return Icons.checkroom_outlined;
      case 'قرطاسية':
        return Icons.edit_outlined;
      case 'حقائب':
        return Icons.backpack_outlined;
      case 'إكسسوارات':
        return Icons.diamond_outlined;
      default:
        return Icons.category_outlined;
    }
  }
}