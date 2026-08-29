import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../feedback/product_photo_slot.dart';
import '../feedback/product_stock_pill.dart';

/// بطاقة المنتج بتصميم Otaku Galaxy v2.
///
/// مساحة صورة المنتج تبقى حاوية نظيفة ومحايدة ([ProductPhotoSlot]) جاهزة
/// لصور المنتجات الحقيقية — لا تُوضع رسوم الأنمي داخلها إطلاقاً.
class AnimeProductCard extends StatelessWidget {
  const AnimeProductCard({
    super.key,
    required this.product,
    this.onTap,
    this.onFavoriteToggle,
    this.isFavorite = false,
    this.width,
    this.compact = false,
  });

  final dynamic product;
  final VoidCallback? onTap;
  final VoidCallback? onFavoriteToggle;
  final bool isFavorite;
  final double? width;

  /// نسخة المفضلة في المصدر: الاسم والسعر فقط — بلا كبسولة مخزون ولا تقييم
  /// ولا سطر ترويج توصيل.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final inStock = product.inStock as bool;

    final card = Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        boxShadow: colors.shadowSoft,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── مساحة صورة المنتج ──
              SizedBox(
                height: 130,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ProductPhotoSlot(
                      imageUrl: _firstImage,
                      desaturated: !inStock,
                    ),
                    // شارة العرض/المختار — أعلى جهة البداية.
                    if (_badgeLabel != null)
                      PositionedDirectional(
                        top: 9,
                        start: 9,
                        child: _Badge(
                          label: _badgeLabel!,
                          highlighted: (product.isOffer as bool) ||
                              (product.discountPercent as int? ?? 0) > 0,
                        ),
                      ),
                    // زر المفضلة — دائري أعلى جهة النهاية.
                    if (onFavoriteToggle != null)
                      PositionedDirectional(
                        top: 8,
                        end: 8,
                        child: _FavoriteButton(
                          isFavorite: isFavorite,
                          onTap: onFavoriteToggle!,
                        ),
                      ),
                    // شريط «نفد المخزون» أسفل الصورة.
                    if (!inStock)
                      const PositionedDirectional(
                        start: 0,
                        end: 0,
                        bottom: 0,
                        child: _SoldOutStrip(),
                      ),
                  ],
                ),
              ),
              // ── تفاصيل المنتج ──
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 11, 12, 13),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      height: 36,
                      child: Text(
                        product.name as String,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          fontSize: 12.5,
                          height: 1.4,
                          fontWeight: AppDimens.weightSemiBold,
                          color: Theme.of(context).colorScheme.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(height: AppDimens.space2),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            '${(product.price as double).toStringAsFixed(0)} د.ع',
                            textDirection: TextDirection.ltr,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelLarge
                                ?.copyWith(
                                  fontFamily: 'Tajawal',
                                  fontSize: 14,
                                  fontWeight: AppDimens.weightExtraBold,
                                  color: AppColors.secondary,
                                ),
                          ),
                        ),
                        // السعر السابق يظهر فقط حين يرسله الخادم فعلاً.
                        if (product.hasDiscount as bool) ...[
                          const SizedBox(width: 7),
                          Flexible(
                            child: Text(
                              (product.previousPrice as double)
                                  .toStringAsFixed(0),
                              textDirection: TextDirection.ltr,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    fontSize: 11,
                                    decoration: TextDecoration.lineThrough,
                                    color: Theme.of(context).colorScheme.outline,
                                  ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (!compact) ...[
                    const SizedBox(height: AppDimens.space2),
                    Row(
                      children: [
                        Expanded(
                          child: ProductStockPill(stock: product.stock as int),
                        ),
                        if (product.rating != null) ...[
                          Icon(
                            Icons.star_rounded,
                            size: 12,
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            (product.rating as double).toStringAsFixed(1),
                            textDirection: TextDirection.ltr,
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(
                                  fontSize: 10.5,
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ],
                      ],
                    ),
                    ],
                    if (!compact && _deliveryPromoLabel != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Text('🚚', style: TextStyle(fontSize: 10)),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              _deliveryPromoLabel!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    fontSize: 9.5,
                                    fontWeight: AppDimens.weightBold,
                                    color: AppColors.success,
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return width == null ? card : SizedBox(width: width, child: card);
  }

  String? get _firstImage {
    final images = product.images;
    if (images is List && images.isNotEmpty) {
      final first = images.first as String;
      return first.isEmpty ? null : first;
    }
    return null;
  }

  /// سطر ترويج التوصيل بقيمته الحقيقية من الخادم.
  ///
  /// لا يُعرض ما لم يوجد مبلغ فعلي — الشارة يجب أن تُترجم دائماً إلى خصم
  /// حقيقي يطبّقه الخادم عند إنشاء الطلب.
  String? get _deliveryPromoLabel {
    if (product.hasDeliveryPromo as bool != true) return null;
    final amount = (product.deliveryPromoAmount as num?)?.toDouble() ?? 0;
    if (amount <= 0) return null;
    return 'خصم ${amount.toStringAsFixed(0)} د.ع من التوصيل لكل قطعة';
  }

  /// شارة البطاقة: نسبة الخصم الحقيقية أولاً (لا تظهر إلا بوجود سعر سابق
  /// أعلى من الحالي)، ثم «عرض»، ثم «مختار». لا نخترع قيمة عند غياب البيانات.
  String? get _badgeLabel {
    final percent = product.discountPercent as int?;
    if (percent != null && percent > 0) return '−$percent٪';
    if (product.isOffer as bool) return 'عرض';
    if (product.isSelected as bool) return 'مختار';
    return null;
  }
}

/// شارة العرض (تدرّج وردي‑بنفسجي) أو المختار (أزرق هادئ).
class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.highlighted});

  final String label;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        gradient: highlighted ? context.themeColors.primaryGradient : null,
        color: highlighted
            ? null
            : Color.alphaBlend(
                AppColors.accentCyan.withValues(alpha: 0.20),
                Theme.of(context).colorScheme.surface,
              ),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 9.5,
          fontWeight: AppDimens.weightExtraBold,
          color: highlighted ? Colors.white : AppColors.accentCyan,
        ),
      ),
    );
  }
}

/// زر المفضلة الدائري — القلب نفسه كبير وواضح داخل الدائرة.
class _FavoriteButton extends StatelessWidget {
  const _FavoriteButton({required this.isFavorite, required this.onTap});

  final bool isFavorite;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: isFavorite
          ? AppColors.secondary
          : Theme.of(context).colorScheme.surface,
      shape: const CircleBorder(),
      elevation: 0,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 29,
          height: 29,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: colors.shadowXSoft,
          ),
          child: Icon(
            isFavorite ? Icons.favorite : Icons.favorite_border,
            size: 17,
            color: isFavorite
                ? Colors.white
                : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _SoldOutStrip extends StatelessWidget {
  const _SoldOutStrip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      color: const Color(0xBD180F30),
      child: Text(
        'نفد المخزون',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 10,
          fontWeight: AppDimens.weightExtraBold,
          color: Colors.white,
        ),
      ),
    );
  }
}
