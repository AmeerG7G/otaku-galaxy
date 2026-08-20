import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/search_products_usecase.dart';

@RoutePage()
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.initialQuery = ''});

  final String initialQuery;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  List<Product> _results = [];
  bool _searched = false;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    if (widget.initialQuery.isNotEmpty) {
      _controller.text = widget.initialQuery;
      _search(widget.initialQuery);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _results = [];
        _searched = false;
      });
      return;
    }

    setState(() {
      _searched = true;
      _loading = true;
    });
    final results = await context.read<SearchProductsUsecase>()(trimmed);
    if (!mounted) return;
    setState(() {
      _results = results.items;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(
        title: Container(
          height: 44,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(AppDimens.radiusFull),
          ),
          child: TextField(
            controller: _controller,
            autofocus: true,
            textInputAction: TextInputAction.search,
            onSubmitted: _search,
            style: Theme.of(context).textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'ابحث عن منتج...',
              hintStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(
                  context,
                ).colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
              ),
              prefixIcon: Icon(
                Icons.search,
                color: Theme.of(context).colorScheme.primary,
              ),
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: Icon(
                        Icons.clear,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      onPressed: () {
                        _controller.clear();
                        _search('');
                        setState(() {});
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(
                horizontal: AppDimens.space4,
                vertical: AppDimens.space3,
              ),
            ),
            onChanged: (value) {
              if (value.trim().isEmpty) {
                _search('');
              }
              setState(() {});
            },
          ),
        ),
        actions: [
          IconButton(
            onPressed: () => _search(_controller.text),
            icon: Icon(
              Icons.search,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingState()
            : !_searched
            ? _buildInitialState(context)
            : _results.isEmpty
            ? AnimeEmptyState(
                title: 'لا توجد نتائج',
                subtitle: 'جرب البحث بكلمات أخرى',
                icon: Icons.search_off_outlined,
              )
            : _buildResultsList(),
      ),
    );
  }

  Widget _buildLoadingState() {
    return ListView.builder(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      itemCount: 5,
      itemBuilder: (context, index) => _buildResultSkeleton(),
    );
  }

  Widget _buildInitialState(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: EdgeInsets.all(AppDimens.space9),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                gradient: colors.primaryGradient,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.search,
                size: AppDimens.iconHero,
                color: Colors.white,
              ),
            ),
            SizedBox(height: AppDimens.space5),
            Text(
              'ابحث عن منتجاتك المفضلة',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
              ),
            ),
            SizedBox(height: AppDimens.space3),
            Text(
              'اكتب اسم المنتج أو الفئة في شريط البحث أعلاه',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultsList() {
    return ListView.separated(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      itemCount: _results.length,
      separatorBuilder: (_, _) => SizedBox(height: AppDimens.space3),
      itemBuilder: (context, index) {
        final product = _results[index];
        return _SearchResultTile(product: product);
      },
    );
  }

  Widget _buildResultSkeleton() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.all(AppDimens.cardPadding),
        child: Row(
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Theme.of(context).colorScheme.outlineVariant,
                    Theme.of(context).colorScheme.surfaceContainerHighest,
                  ],
                ),
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
              ),
            ),
            SizedBox(width: AppDimens.space4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSkeletonLine(width: 0.6, height: 16),
                  SizedBox(height: AppDimens.space2),
                  _buildSkeletonLine(width: 0.4, height: 14),
                  SizedBox(height: AppDimens.space2),
                  _buildSkeletonLine(width: 0.3, height: 14),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSkeletonLine({required double width, required double height}) {
    return FractionallySizedBox(
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
    );
  }
}

class _SearchResultTile extends StatelessWidget {
  const _SearchResultTile({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isFavorite = context.select<FavoritesCubit, bool>(
      (cubit) => cubit.state.isFavorite(product.id),
    );

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: InkWell(
        onTap: () =>
            context.router.push(ProductDetailRoute(productId: product.id)),
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        child: Padding(
          padding: EdgeInsets.all(AppDimens.cardPadding),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  child: product.images.isNotEmpty
                      ? Image.network(
                          product.images.first,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _buildPlaceholder(context),
                        )
                      : _buildPlaceholder(context),
                ),
              ),
              SizedBox(width: AppDimens.space4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: AppDimens.weightSemiBold,
                      ),
                    ),
                    SizedBox(height: AppDimens.space2),
                    Row(
                      children: [
                        Text(
                          product.inStock
                              ? '${product.price.toStringAsFixed(0)} د.ع'
                              : 'نفذت الكمية',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                fontWeight: AppDimens.weightBold,
                                color: product.inStock
                                    ? Theme.of(context).colorScheme.primary
                                    : colors.error,
                              ),
                        ),
                        if (product.rating != null) ...[
                          SizedBox(width: AppDimens.space3),
                          Row(
                            children: [
                              Icon(
                                Icons.star_rounded,
                                size: AppDimens.iconXs,
                                color: AppColors.accent,
                              ),
                              SizedBox(width: AppDimens.space1),
                              Text(
                                product.rating!.toStringAsFixed(1),
                                style: Theme.of(context).textTheme.labelSmall
                                    ?.copyWith(
                                      fontWeight: AppDimens.weightSemiBold,
                                    ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(width: AppDimens.space3),
              IconButton(
                onPressed: () => context.read<FavoritesCubit>().toggle(product),
                icon: Icon(
                  isFavorite ? Icons.favorite : Icons.favorite_border,
                  size: AppDimens.iconMd,
                ),
                style: IconButton.styleFrom(
                  backgroundColor: isFavorite
                      ? colors.errorPale
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  foregroundColor: isFavorite
                      ? colors.error
                      : Theme.of(context).colorScheme.onSurfaceVariant,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlaceholder(BuildContext context) {
    return Icon(
      Icons.image_outlined,
      size: AppDimens.iconMd,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
    );
  }
}
