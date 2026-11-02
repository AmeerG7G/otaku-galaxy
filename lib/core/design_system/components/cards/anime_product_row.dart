import 'package:flutter/material.dart';
import '../../../l10n/app_strings.dart';

import '../../../../features/products/domain/entities/product.dart';
import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_fonts.dart';
import '../feedback/product_photo_slot.dart';
import '../feedback/product_stock_pill.dart';
import '../layout/otaku_surfaces.dart';
import '../../../utils/formatters.dart';

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
              imageUrl: product.coverImage,
              showLabel: false,
              iconSize: 22,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  localizedProductName(product, context.language),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    height: 1.5,
                    fontWeight: AppDimens.weightSemiBold,
                  ),
                ),
                const SizedBox(height: 6),
                ProductStockPill.forProduct(product),
              ],
            ),
          ),
          const SizedBox(width: 10),
          trailing ??
              // عرضٌ محدود: «السعر لم يُعلن بعد» (084) أعرض من أي سعر، فيلتفّ
              // سطرين بدل أن يدفع الاسم خارج الصفّ على ٣٢٠.
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 96),
                child: Text(
                  formatProductPrice(context, product),
                  textDirection: product.priceAnnounced ? TextDirection.ltr : null,
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontFamily: AppFonts.heading,
                    fontFamilyFallback: AppFonts.headingFallback,
                    fontWeight: AppDimens.weightExtraBold,
                    fontSize: product.priceAnnounced ? 14 : 12,
                    color: AppColors.secondary,
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
