import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// نجوم التقييم — للعرض فقط أو للاختيار عند تمرير [onChanged].
class StarRating extends StatelessWidget {
  const StarRating({
    super.key,
    required this.rating,
    this.onChanged,
    this.size = AppDimens.iconLg,
  });

  final int rating;
  final ValueChanged<int>? onChanged;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (index) {
        final value = index + 1;
        final filled = value <= rating;
        final star = Icon(
          filled ? Icons.star_rounded : Icons.star_border_rounded,
          size: size,
          color: filled
              ? AppColors.accent
              : Theme.of(context).colorScheme.outlineVariant,
        );
        if (onChanged == null) {
          return Padding(
            padding: EdgeInsetsDirectional.only(start: AppDimens.space1),
            child: star,
          );
        }
        return GestureDetector(
          onTap: () => onChanged!(value),
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: AppDimens.space1),
            child: star,
          ),
        );
      }),
    );
  }
}
