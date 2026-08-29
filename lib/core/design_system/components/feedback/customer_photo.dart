import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// صورة عميل حقيقية (تقييم/مجتمع).
///
/// تختلف عن [ProductPhotoSlot]: هذه تعرض صورة رفعها عميل فعلاً. عند غياب
/// الصورة أو فشل تحميلها نعرض مؤشّراً محايداً — ولا نستبدلها برسوم أنمي
/// إطلاقاً، لأن ذلك يوهم بوجود صورة عميل غير موجودة.
class CustomerPhoto extends StatelessWidget {
  const CustomerPhoto({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.iconSize = 24,
  });

  final String? url;
  final BoxFit fit;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final value = url?.trim() ?? '';
    if (value.isEmpty) return _Neutral(iconSize: iconSize);

    return Image.network(
      value,
      fit: fit,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : _Busy(iconSize: iconSize),
      errorBuilder: (_, _, _) => _Neutral(iconSize: iconSize),
    );
  }
}

/// حالة تحميل هادئة بلون فتحة الصورة نفسه.
class _Busy extends StatelessWidget {
  const _Busy({required this.iconSize});

  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ColoredBox(
      color: colors.photoSlot,
      child: Center(
        child: SizedBox(
          width: iconSize * 0.7,
          height: iconSize * 0.7,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: colors.photoSlotInk,
          ),
        ),
      ),
    );
  }
}

/// غياب الصورة أو فشل تحميلها — مؤشّر محايد بلا أي رسم تزييني.
class _Neutral extends StatelessWidget {
  const _Neutral({required this.iconSize});

  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ColoredBox(
      color: colors.photoSlot,
      child: Center(
        child: Icon(
          Icons.image_not_supported_outlined,
          size: iconSize,
          color: colors.photoSlotInk,
        ),
      ),
    );
  }
}

/// شبكة/شريط صور العملاء أثناء التحميل.
class CustomerPhotoSkeleton extends StatelessWidget {
  const CustomerPhotoSkeleton({super.key, this.radius = 18});

  final double radius;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      decoration: BoxDecoration(
        color: colors.photoSlot,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
    );
  }
}

/// أبعاد مصغّر صورة العميل في شريط تفاصيل المنتج.
const double kCustomerPhotoThumbSize = 88;
const double kCustomerPhotoThumbRadius = AppDimens.radiusSm + 2;
