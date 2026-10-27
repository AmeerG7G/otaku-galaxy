import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../cart/presentation/widgets/line_color_label.dart';
import '../../../products/domain/entities/product.dart';

/// مُنتقي لون المنتج (STEP 74) في صفحة التفاصيل.
///
/// [variants] الألوان الفعّالة وحدها بترتيبها — غير الفعّال لا يصل إلى هنا.
/// اللون الذي نفد مخزونه يُعرض معطَّلاً (باهتاً ومشطوب الاسم) ولا يُختار،
/// ويقول ذلك لقارئ الشاشة. لا اختيار افتراضي: كالخيارات، الزبون يختار.
class ProductColorSelector extends StatelessWidget {
  const ProductColorSelector({
    super.key,
    required this.variants,
    required this.selectedId,
    required this.onSelected,
  });

  final List<ProductVariant> variants;
  final String? selectedId;
  final ValueChanged<ProductVariant> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: [
        for (final variant in variants)
          _ColorChip(
            key: Key('color_option_${variant.id}'),
            variant: variant,
            selected: variant.id == selectedId,
            onTap: variant.inStock ? () => onSelected(variant) : null,
          ),
      ],
    );
  }
}

class _ColorChip extends StatelessWidget {
  const _ColorChip({
    super.key,
    required this.variant,
    required this.selected,
    required this.onTap,
  });

  final ProductVariant variant;
  final bool selected;

  /// `null` = لونٌ نفد — معطَّل.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;
    final name = variant.nameIn(context.language);

    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      label: enabled
          ? name
          : '$name${context.strings('listSeparator')}'
                '${context.strings('outOfStock')}',
      excludeSemantics: true,
      onTap: onTap,
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppDimens.radiusFull),
          child: AnimatedContainer(
            duration: AppDimens.durationFast,
            curve: AppDimens.curveEmphasized,
            padding: const EdgeInsetsDirectional.fromSTEB(7, 6, 14, 6),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.secondary.withValues(alpha: 0.12)
                  : theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
              border: Border.all(
                color: selected
                    ? AppColors.secondary
                    : theme.colorScheme.outlineVariant,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ColorSwatchDot(
                  colorHex: variant.colorHex,
                  imageUrl: variant.imageUrl,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontSize: 12.5,
                      fontWeight: selected
                          ? AppDimens.weightExtraBold
                          : AppDimens.weightBold,
                      color: selected
                          ? AppColors.secondary
                          : theme.colorScheme.onSurface,
                      decoration: enabled ? null : TextDecoration.lineThrough,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
