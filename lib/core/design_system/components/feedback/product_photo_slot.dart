import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// حاوية صورة المنتج الموحّدة في كل التطبيق.
///
/// قاعدة تصميمية صارمة: مساحة صورة المنتج تبقى محايدة ونظيفة وجاهزة لصور
/// المنتجات الحقيقية — لا تُوضع رسوم شخصيات الأنمي داخلها إطلاقاً. عند غياب
/// الصورة يظهر مؤشّر صورة هادئ بدل أي عنصر تزييني.
class ProductPhotoSlot extends StatelessWidget {
  const ProductPhotoSlot({
    super.key,
    this.imageUrl,
    this.desaturated = false,
    this.showLabel = true,
    this.iconSize = 30,
  });

  final String? imageUrl;
  final bool desaturated;
  final bool showLabel;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final url = imageUrl;

    Widget content;
    if (url == null || url.trim().isEmpty) {
      content = _Placeholder(showLabel: showLabel, iconSize: iconSize);
    } else {
      content = Image.network(
        url,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : _Placeholder(showLabel: false, iconSize: iconSize),
        errorBuilder: (_, _, _) =>
            _Placeholder(showLabel: showLabel, iconSize: iconSize),
      );
    }

    if (desaturated) {
      content = ColorFiltered(
        colorFilter: const ColorFilter.matrix(<double>[
          0.46, 0.36, 0.11, 0, 0,
          0.46, 0.36, 0.11, 0, 0,
          0.46, 0.36, 0.11, 0, 0,
          0, 0, 0, 1, 0,
        ]),
        child: content,
      );
    }

    return ColoredBox(color: colors.photoSlot, child: content);
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.showLabel, required this.iconSize});

  final bool showLabel;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.image_outlined,
            size: iconSize,
            color: colors.photoSlotInk,
          ),
          if (showLabel) ...[
            const SizedBox(height: AppDimens.space2),
            Text(
              'صورة المنتج',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: 9.5,
                color: colors.photoSlotInk,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
