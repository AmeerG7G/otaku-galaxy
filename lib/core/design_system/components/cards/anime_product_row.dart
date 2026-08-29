import 'package:flutter/material.dart';

import '../../../../features/products/domain/entities/product.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../feedback/product_photo_slot.dart';
import '../feedback/product_stock_pill.dart';
import '../layout/otaku_surfaces.dart';

/// صفّ منتج أفقي — يُستخدم في نتائج البحث والقوائم المضغوطة.
///
/// فتحة صورة مربّعة ٦٢×٦٢، اسم المنتج، شارة المخزون، ثم السعر بالوردي.
class AnimeProductRow extends StatelessWidget {
  const AnimeProductRow({
    super.key,
    required this.product,
    this.onTap,
    this.trailing,
  });

  final Product product;
  final VoidCallback? onTap;

  /// عنصر بديل للسعر في نهاية الصف.
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return OtakuPanel(
      onTap: onTap,
      padding: const EdgeInsets.all(11),
      child: Row(
        children: [
          Container(
            width: 62,
            height: 62,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: theme.colorScheme.outlineVariant),
            ),
            clipBehavior: Clip.antiAlias,
            child: ProductPhotoSlot(
              imageUrl: product.images.isNotEmpty ? product.images.first : null,
              showLabel: false,
              iconSize: 22,
              desaturated: !product.inStock,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    height: 1.5,
                    fontWeight: AppDimens.weightSemiBold,
                  ),
                ),
                const SizedBox(height: 6),
                ProductStockPill(stock: product.stock),
              ],
            ),
          ),
          const SizedBox(width: 10),
          trailing ??
              Text(
                '${product.price.toStringAsFixed(0)} د.ع',
                textDirection: TextDirection.ltr,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontFamily: 'Tajawal',
                  fontWeight: AppDimens.weightExtraBold,
                  fontSize: 14,
                  color: AppColors.secondary,
                ),
              ),
        ],
      ),
    );
  }
}
