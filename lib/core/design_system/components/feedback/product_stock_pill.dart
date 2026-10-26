import 'package:flutter/material.dart';
import '../../../l10n/app_strings.dart';
import '../../../../features/products/domain/entities/product.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

/// شارة حالة المخزون: متوفر / آخر قطع / قريباً يتوفر / نفد.
///
/// كبسولة صغيرة بخلفية شفافة من لون الحالة نفسه — نمط v2 الموحّد.
///
/// [CRITICAL] الحالة تُمرَّر ولا تُحسب هنا. الشارة كانت تقرأ `stock` وحده،
/// فلم تكن تملك ما تفرّق به بين «صفر ولا موعد» و«صفر وله موعد» — وتقول
/// «نفد المخزون» عن منتجٍ للمتجر موعدٌ معلن لعودته. الحساب في
/// [Product.availability] وحده.
class ProductStockPill extends StatelessWidget {
  const ProductStockPill({
    super.key,
    required this.stock,
    this.availability = ProductAvailability.unavailable,
    this.align = true,
  });

  /// الشارة من منتج — الاستعمال المعتاد، ويحمل الحالة معه.
  factory ProductStockPill.forProduct(
    Product product, {
    Key? key,
    bool align = true,
  }) => ProductStockPill(
    key: key,
    stock: product.stock,
    availability: product.availability,
    align: align,
  );

  final int stock;

  /// حالة التوفر المحسوبة في [Product.availability].
  ///
  /// القيمة الافتراضية تخصّ الاستدعاء بمخزون صفر بلا منتج (اختبارات ومعاينات
  /// النظام)؛ المخزون الموجب يفوز عليها في كل الأحوال.
  final ProductAvailability availability;

  /// محاذاة الكبسولة لبداية السطر داخل عمود ممتد.
  final bool align;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    // المخزون الموجب يسبق كل شيء: منتجٌ في اليد لا يُوصف بالانتظار مهما
    // بقي في القاعدة من مواعيد.
    final (String label, Color tint, Color textColor) = switch ((
      stock,
      availability,
    )) {
      (> 0, _) when stock <= 3 => (
        context.strings.p('lastPiecesCount', {'count': '$stock'}),
        colors.warning,
        colors.warningText,
      ),
      (> 0, _) => (
        context.strings('available'),
        colors.success,
        colors.successText,
      ),
      // مخزون صفر وله موعد: حالة انتظار معلنة لا نفاد.
      (_, ProductAvailability.comingSoon) => (
        context.strings('comingSoon'),
        colors.info,
        colors.infoText,
      ),
      // «نفد المخزون» لا «غير متوفر»: الأولى تصف حالةً مؤقّتة يمكن
      // انتظارها (ومن هنا زرّ «أعلمني عند توفره»)، والثانية توحي بأن
      // المنتج لم يعد يُباع فيغادر الزبون بلا سبب.
      _ => (context.strings('outOfStock'), colors.error, colors.errorText),
    };
    final color = tint;

    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 10,
          height: 1.3,
          fontWeight: AppDimens.weightBold,
          // الصيغة النصّية لا المؤشِّرة: لون الشارة نفسه يصنع الخلفية
          // (١٤٪)، فرسم الحروف به يعطي تبايناً دون الحدّ.
          color: textColor,
        ),
      ),
    );

    return align
        ? Align(alignment: AlignmentDirectional.centerStart, child: pill)
        : pill;
  }
}
