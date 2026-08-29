import 'package:flutter/material.dart';

import '../../../products/domain/entities/product.dart';
import 'home_compositions.dart';
import 'product_card.dart';

/// شريط منتجات أفقي بعنوان قسم v2.
///
/// الشارات (عرض/مختار) صارت جزءاً من بطاقة المنتج نفسها اعتماداً على
/// بيانات الخادم (isOffer/isSelected)، فلم تعد تُمرَّر من هنا.
class ProductSection extends StatelessWidget {
  const ProductSection({
    super.key,
    required this.title,
    required this.products,
    this.onSeeAll,
  });

  final String title;
  final List<Product> products;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: title, onSeeAll: onSeeAll),
        SizedBox(
          height: 246,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            itemCount: products.length,
            separatorBuilder: (_, _) => const SizedBox(width: 13),
            itemBuilder: (context, index) => SizedBox(
              width: 158,
              child: ProductCard(product: products[index]),
            ),
          ),
        ),
      ],
    );
  }
}
