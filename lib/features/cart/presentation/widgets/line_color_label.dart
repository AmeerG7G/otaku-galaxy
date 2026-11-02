import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../domain/entities/cart_item.dart';

/// `#RRGGBB` (أو `RRGGBB`) إلى [Color]؛ قيمةٌ معطوبة تُقرأ `null` لا ترمي —
/// فيُعرض بديلها (صورة اللون أو اسمه وحده) بدل إسقاط الشاشة.
Color? parseColorHex(String? hex) {
  if (hex == null) return null;
  final digits = hex.trim().replaceFirst('#', '');
  if (digits.length != 6) return null;
  final value = int.tryParse(digits, radix: 16);
  return value == null ? null : Color(0xFF000000 | value);
}

/// دائرة لون المنتج — باللون المعلن، أو بصورة اللون مصغّرةً حين لا لون.
///
/// حدٌّ رفيع دائماً: الأبيض على سطحٍ فاتح والأسود على الداكن يختفيان بدونه.
class ColorSwatchDot extends StatelessWidget {
  const ColorSwatchDot({
    super.key,
    this.colorHex,
    this.imageUrl,
    this.size = 18,
  });

  final String? colorHex;
  final String? imageUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = parseColorHex(colorHex);
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color ?? theme.colorScheme.surfaceContainerHighest,
        border: Border.all(color: theme.colorScheme.outline, width: 1),
      ),
      child: color == null && imageUrl != null
          ? ProductPhotoSlot(
              imageUrl: imageUrl,
              showLabel: false,
              iconSize: size * 0.5,
            )
          : null,
    );
  }
}

/// «اللون: أحمر» مع دائرته — يُعرض في سطر السلة والمراجعة والطلب. خيار
/// تصميمٍ أو مقاس (090) يُسمّى بنوعه: «التصميم: سوكونا».
///
/// الاسم من [LineColor.nameIn] بلغة الواجهة الآن، لا من نصٍّ محسومٍ سلفاً.
class LineColorLabel extends StatelessWidget {
  const LineColorLabel({super.key, required this.color, this.fontSize = 11});

  final LineColor color;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      key: const Key('line_color_label'),
      mainAxisSize: MainAxisSize.min,
      children: [
        if (parseColorHex(color.colorHex) != null) ...[
          ColorSwatchDot(colorHex: color.colorHex, size: fontSize + 2),
          const SizedBox(width: 6),
        ],
        Flexible(
          child: Text(
            context.strings.p(color.kind.lineValueKey, {
              'color': color.nameIn(context.language),
            }),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: fontSize,
              fontWeight: AppDimens.weightBold,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}
