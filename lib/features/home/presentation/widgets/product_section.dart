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

  /// ارتفاع الصفّ المصمَّم: بطاقةٌ بلا سطر ترويج عند مقياس ١٫٠ (٢٤٠) وهامشها.
  static const double designHeight = 246;

  /// عرض البطاقة في الصفّ.
  static const double cardWidth = 158;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: title, onSeeAll: onSeeAll),
        // [CRITICAL] (البوّابة ٩، 2026-10-12) الصفّ بارتفاع أطول بطاقاته، ولا
        // يقلّ عن [designHeight]. كان ٢٤٦ ثابتاً والبطاقة لا تعرفه: تكبر مع
        // مقياس الخطّ (٢٥٠ عند ×١٫٣) وبسطر ترويج التوصيل (٢٦١ عند ١٫٠)،
        // فيتجاوزها عمودها ٤–٢٩ بكسل بالعربية والكردية معاً. البطاقات كلّها
        // بارتفاعٍ واحد (`IntrinsicHeight`)، وعددها ثمانية على الأكثر (حدّ
        // الخادم)، فبناؤها دفعةً واحدة لا كلفة له.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: designHeight),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (index, product) in products.indexed) ...[
                    if (index > 0) const SizedBox(width: 13),
                    SizedBox(
                      width: cardWidth,
                      child: ProductCard(product: product),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
