import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_product_details_usecase.dart';

@RoutePage()
class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Product? _product;
  bool _loading = true;
  int _quantity = 1;
  final Map<String, String> _selectedOptions = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final fetchDetails = context.read<FetchProductDetailsUsecase>();
      final product = await fetchDetails(widget.productId);
      if (!mounted) return;
      setState(() => _product = product);
    } catch (_) {
      if (!mounted) return;
      setState(() => _product = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = _product;
    final colors = context.themeColors;
    final isFavorite =
        product != null &&
        context.select<FavoritesCubit, bool>(
          (cubit) => cubit.state.isFavorite(product.id),
        );

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingState()
            : product == null
            ? _buildErrorState(context)
            : CustomScrollView(
                slivers: [
                  // صورة المنتج مع AppBar مدمج
                  SliverAppBar(
                    expandedHeight: 320,
                    pinned: true,
                    stretch: true,
                    elevation: 0,
                    backgroundColor: Colors.transparent,
                    surfaceTintColor: Colors.transparent,
                    flexibleSpace: FlexibleSpaceBar(
                      stretchModes: const [
                        StretchMode.zoomBackground,
                        StretchMode.blurBackground,
                      ],
                      background: Stack(
                        fit: StackFit.expand,
                        children: [
                          _buildProductImage(product),
                          // تدرج علوي
                          Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Colors.black.withValues(alpha: 0.4),
                                  Colors.transparent,
                                ],
                                begin: Alignment.topCenter,
                                end: Alignment.center,
                              ),
                            ),
                          ),
                          // شارة التقييم
                          if (product.rating != null && product.rating! >= 4.5)
                            Positioned(
                              top: AppDimens.space6 + kToolbarHeight,
                              right: AppDimens.screenHorizontalPadding,
                              child: Container(
                                padding: EdgeInsets.symmetric(
                                  horizontal: AppDimens.space3,
                                  vertical: AppDimens.space1,
                                ),
                                decoration: BoxDecoration(
                                  gradient: colors.accentGradient,
                                  borderRadius: BorderRadius.circular(
                                    AppDimens.radiusFull,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: colors.glowAccent,
                                      blurRadius: 8,
                                      spreadRadius: 1,
                                    ),
                                  ],
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.star,
                                      size: AppDimens.iconXs,
                                      color: Colors.white,
                                    ),
                                    SizedBox(width: AppDimens.space1),
                                    Text(
                                      'الأعلى تقييماً',
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall
                                          ?.copyWith(
                                            color: Colors.white,
                                            fontWeight: AppDimens.weightBold,
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          // شارة نفذت الكمية
                          if (!product.inStock)
                            Positioned(
                              top: AppDimens.space6 + kToolbarHeight,
                              right: AppDimens.screenHorizontalPadding,
                              child: Container(
                                padding: EdgeInsets.symmetric(
                                  horizontal: AppDimens.space3,
                                  vertical: AppDimens.space1,
                                ),
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [colors.error, colors.errorLight],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  borderRadius: BorderRadius.circular(
                                    AppDimens.radiusFull,
                                  ),
                                ),
                                child: Text(
                                  'نفذت الكمية',
                                  style: Theme.of(context).textTheme.labelSmall
                                      ?.copyWith(
                                        color: Colors.white,
                                        fontWeight: AppDimens.weightBold,
                                      ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    leading: Container(
                      margin: EdgeInsets.all(AppDimens.space3),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                      ),
                      child: IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: Icon(Icons.arrow_back_ios, color: Colors.white),
                      ),
                    ),
                    actions: [
                      Container(
                        margin: EdgeInsets.all(AppDimens.space3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusMd,
                          ),
                        ),
                        child: IconButton(
                          onPressed: () =>
                              context.read<FavoritesCubit>().toggle(product),
                          icon: Icon(
                            isFavorite ? Icons.favorite : Icons.favorite_border,
                            color: isFavorite
                                ? colors.errorLight
                                : Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),

                  // تفاصيل المنتج
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(
                        AppDimens.screenHorizontalPadding,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // اسم المنتج والسعر
                          _buildProductHeader(product),

                          SizedBox(height: AppDimens.space5),

                          // التقييم والمخزون
                          _buildRatingAndStock(context, product),

                          SizedBox(height: AppDimens.space5),

                          // الوصف
                          _buildDescription(product),

                          // الخيارات
                          if (product.options != null &&
                              product.options!.isNotEmpty) ...[
                            SizedBox(height: AppDimens.space5),
                            _buildOptions(product),
                          ],

                          SizedBox(height: AppDimens.space5),

                          // كمية
                          _buildQuantitySelector(product),

                          SizedBox(height: AppDimens.space7),

                          // أزرار الإجراء
                          _buildActionButtons(context, product, isFavorite),

                          SizedBox(height: AppDimens.space10),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildLoadingState() {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 320,
          pinned: true,
          backgroundColor: Colors.transparent,
          flexibleSpace: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Theme.of(context).colorScheme.outlineVariant,
                  Theme.of(context).colorScheme.surfaceContainerHighest,
                ],
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSkeletonLine(width: 0.6, height: 28),
                SizedBox(height: AppDimens.space3),
                _buildSkeletonLine(width: 0.4, height: 24),
                SizedBox(height: AppDimens.space6),
                _buildSkeletonLine(width: 1.0, height: 16),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.8, height: 16),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.6, height: 16),
                SizedBox(height: AppDimens.space6),
                _buildSkeletonLine(width: 1.0, height: 16),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.9, height: 16),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.7, height: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSkeletonLine({required double width, required double height}) {
    return SizedBox(
      width: double.infinity,
      child: FractionallySizedBox(
        widthFactor: width,
        child: Container(
          height: height,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                Theme.of(context).colorScheme.outlineVariant,
                Theme.of(context).colorScheme.surfaceContainerHighest,
              ],
            ),
            borderRadius: BorderRadius.circular(AppDimens.radiusSm),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    return Center(
      child: AnimeErrorState(
        title: 'المنتج غير موجود',
        message: 'تعذر تحميل تفاصيل المنتج. يرجى المحاولة مرة أخرى.',
        actionLabel: 'إعادة المحاولة',
        onAction: _load,
      ),
    );
  }

  Widget _buildProductImage(Product product) {
    if (product.images.isNotEmpty) {
      return Image.network(
        product.images.first,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                value: progress.expectedTotalBytes != null
                    ? progress.cumulativeBytesLoaded /
                          progress.expectedTotalBytes!
                    : null,
                valueColor: AlwaysStoppedAnimation<Color>(
                  Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
          );
        },
        errorBuilder: (context, error, stackTrace) => _buildImagePlaceholder(),
      );
    }
    return _buildImagePlaceholder();
  }

  Widget _buildImagePlaceholder() {
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Center(
        child: OtakuStoreLogoSimple(
          size: AppDimens.iconHero * 2,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }

  Widget _buildProductHeader(Product product) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          product.name,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: AppDimens.weightBold,
            letterSpacing: AppDimens.letterSpacingTight,
          ),
        ),
        SizedBox(height: AppDimens.space3),
        Row(
          children: [
            Text(
              formatPrice(product.price),
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: AppDimens.weightExtraBold,
                color: Theme.of(context).colorScheme.primary,
                letterSpacing: AppDimens.letterSpacingTight,
              ),
            ),
            if (product.discountedPrice < product.price) ...[
              SizedBox(width: AppDimens.space3),
              Text(
                formatPrice(product.price),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  decoration: TextDecoration.lineThrough,
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildRatingAndStock(BuildContext context, Product product) {
    final colors = context.themeColors;
    return Row(
      children: [
        if (product.rating != null) ...[
          Container(
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.space3,
              vertical: AppDimens.space1,
            ),
            decoration: BoxDecoration(
              gradient: colors.accentGradient,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.star_rounded,
                  size: AppDimens.iconXs,
                  color: Colors.white,
                ),
                SizedBox(width: AppDimens.space1),
                Text(
                  product.rating!.toStringAsFixed(1),
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                if (product.reviewCount != null &&
                    product.reviewCount! > 0) ...[
                  SizedBox(width: AppDimens.space2),
                  Text(
                    '(${product.reviewCount} تقييم)',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
        const Spacer(),
        _StockIndicator(stock: product.stock),
      ],
    );
  }

  Widget _buildDescription(Product product) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'وصف المنتج',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: AppDimens.weightBold),
        ),
        SizedBox(height: AppDimens.space3),
        Text(
          product.description,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            height: AppDimens.lineHeightRelaxed,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }

  Widget _buildOptions(Product product) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'الخيارات المتاحة',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: AppDimens.weightBold),
        ),
        SizedBox(height: AppDimens.space3),
        Wrap(
          spacing: AppDimens.space3,
          runSpacing: AppDimens.space3,
          children: [
            for (final option in product.options!)
              _OptionSelector(
                option: option,
                value: _selectedOptions[option.name],
                onChanged: (v) =>
                    setState(() => _selectedOptions[option.name] = v),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildQuantitySelector(Product product) {
    return Row(
      children: [
        Text(
          'الكمية:',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: AppDimens.weightSemiBold,
          ),
        ),
        SizedBox(width: AppDimens.space4),
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppDimens.radiusMd),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
              width: AppDimens.cardBorderWidth,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: _quantity > 1
                    ? () => setState(() => _quantity--)
                    : null,
                icon: Icon(Icons.remove, size: AppDimens.iconMd),
                style: IconButton.styleFrom(
                  foregroundColor: Theme.of(
                    context,
                  ).colorScheme.onSurfaceVariant,
                ),
              ),
              Container(
                width: 50,
                alignment: Alignment.center,
                child: Text(
                  '$_quantity',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
              ),
              IconButton(
                onPressed: _quantity < product.stock
                    ? () => setState(() => _quantity++)
                    : null,
                icon: Icon(Icons.add, size: AppDimens.iconMd),
                style: IconButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.primary,
                ),
              ),
            ],
          ),
        ),
        SizedBox(width: AppDimens.space3),
        // الكمية لا تظهر للزبون إلا عند نفاد المخزون (3 قطع أو أقل).
        if (product.lowStock)
          Text(
            'متاح: ${product.stock}',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    );
  }

  Widget _buildActionButtons(
    BuildContext context,
    Product product,
    bool isFavorite,
  ) {
    final colors = context.themeColors;
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: AnimePrimaryButton(
            label: product.inStock ? 'إضافة إلى السلة' : 'نفذت الكمية',
            onPressed: product.inStock
                ? () {
                    context.read<CartCubit>().add(product, quantity: _quantity);
                    _showAddedToCartDialog(product);
                  }
                : null,
            icon: Icons.shopping_cart_outlined,
            iconPosition: IconPosition.start,
            height: AppDimens.buttonHeightXl,
          ),
        ),
        SizedBox(width: AppDimens.space3),
        Expanded(
          child: IconButton.filledTonal(
            onPressed: () => context.read<FavoritesCubit>().toggle(product),
            icon: Icon(
              isFavorite ? Icons.favorite : Icons.favorite_border,
              size: AppDimens.iconLg,
            ),
            style: IconButton.styleFrom(
              backgroundColor: isFavorite
                  ? colors.errorPale
                  : Theme.of(context).colorScheme.surfaceContainerHighest,
              foregroundColor: isFavorite
                  ? colors.error
                  : Theme.of(context).colorScheme.onSurfaceVariant,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppDimens.radiusLg),
              ),
              padding: EdgeInsets.all(AppDimens.space3),
            ),
          ),
        ),
      ],
    );
  }

  /// نافذة نجاح الإضافة إلى السلة: «متابعة التسوق» أو «الذهاب إلى السلة».
  void _showAddedToCartDialog(Product product) {
    final colors = context.themeColors;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppDimens.radius2xl),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: AppDimens.iconHero * 1.5,
              height: AppDimens.iconHero * 1.5,
              decoration: BoxDecoration(
                gradient: colors.primaryGradient,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: colors.glowPrimary,
                    blurRadius: 16,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Icon(
                Icons.check,
                size: AppDimens.iconHero,
                color: Colors.white,
              ),
            ),
            SizedBox(height: AppDimens.space5),
            Text(
              'تمت إضافة المنتج إلى السلة',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
            SizedBox(height: AppDimens.space2),
            Text(
              product.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        actions: [
          Row(
            children: [
              Expanded(
                child: AnimeSecondaryButton(
                  label: 'متابعة التسوق',
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  icon: Icons.storefront_outlined,
                  iconPosition: IconPosition.start,
                ),
              ),
              SizedBox(width: AppDimens.space3),
              Expanded(
                child: AnimePrimaryButton(
                  label: 'الذهاب إلى السلة',
                  onPressed: () {
                    Navigator.of(dialogContext).pop();
                    mainNavIndex.value = 3; // تبويب السلة
                    context.router.popUntilRoot();
                  },
                  icon: Icons.shopping_cart_outlined,
                  iconPosition: IconPosition.start,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String formatPrice(double price) {
    return '${price.toStringAsFixed(0)} د.ع';
  }
}

class _StockIndicator extends StatelessWidget {
  const _StockIndicator({required this.stock});

  final int stock;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (Color color, IconData icon, String label) = switch (stock) {
      <= 0 => (colors.error, Icons.block, 'نفذت الكمية'),
      <= 3 => (
        colors.warning,
        Icons.timelapse,
        'كمية محدودة: $stock قطع متبقية',
      ),
      _ => (colors.success, Icons.check_circle, 'متوفر'),
    };
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: AppDimens.space3,
        vertical: AppDimens.space1,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        border: Border.all(color: color.withValues(alpha: 0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: AppDimens.iconXs),
          SizedBox(width: AppDimens.space1),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: AppDimens.weightBold,
            ),
          ),
        ],
      ),
    );
  }
}

class _OptionSelector extends StatelessWidget {
  const _OptionSelector({
    required this.option,
    required this.value,
    required this.onChanged,
  });

  final ProductOption option;
  final String? value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          option.name,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: AppDimens.weightSemiBold,
          ),
        ),
        SizedBox(height: AppDimens.space2),
        Wrap(
          spacing: AppDimens.space2,
          runSpacing: AppDimens.space2,
          children: [
            for (final v in option.values)
              AnimeChoiceChip(
                label: v,
                selected: value == v,
                onSelected: (_) => onChanged(v),
              ),
          ],
        ),
      ],
    );
  }
}
