import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../home/presentation/widgets/product_card.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_categories_usecase.dart';
import '../../../products/domain/usecases/fetch_category_products_usecase.dart';

@RoutePage()
class CategoryProductsScreen extends StatefulWidget {
  const CategoryProductsScreen({
    super.key,
    required this.categoryId,
    required this.categoryName,
  });

  final String categoryId;
  final String categoryName;

  @override
  State<CategoryProductsScreen> createState() => _CategoryProductsScreenState();
}

class _CategoryProductsScreenState extends State<CategoryProductsScreen> {
  List<Product> _products = [];
  List<String> _subcategories = const [];
  // معرّفات الأقسام الفرعية (اسم → معرّف) لفلترة المنتجات عبر subcategoryId.
  Map<String, String> _subcategoryIds = const {};
  // الصفحة المحددة في المتصفح: 0 = الكل، 1..n = الأقسام الفرعية.
  int _selectedPage = 0;
  bool _loading = true;
  String? _error;

  late final PageController _pageController;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _load();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fetchCategoryProducts = context
          .read<FetchCategoryProductsUsecase>();
      final fetchCategories = context.read<FetchCategoriesUsecase>();
      final products = await fetchCategoryProducts(widget.categoryId);
      List<String> subcategories = const [];
      Map<String, String> subcategoryIds = const {};
      try {
        final categories = await fetchCategories();
        final matched = categories
            .where((Category c) => c.id == widget.categoryId)
            .toList();
        if (matched.isNotEmpty) {
          subcategories = matched.first.subcategories;
          subcategoryIds = matched.first.subcategoryIds;
        }
      } catch (_) {
        // الأقسام الفرعية اختيارية — لا نُفشل الشاشة عند عدم توفرها.
      }
      if (!mounted) return;
      setState(() {
        _products = products;
        _subcategories = subcategories;
        _subcategoryIds = subcategoryIds;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  /// المنتجات الخاصة بصفحة معيّنة (0 = الكل، i = القسم الفرعي i-1).
  List<Product> _productsForPage(int page) {
    if (page == 0) return _products;
    final subcategory = _subcategories[page - 1];
    // الخادم يصدّر معرّف القسم الفرعي في المنتجات (subcategoryId) —
    // نفلتر به، مع رجوع لاسم القسم الفرعي للتوافق القديم عند الحاجة.
    final subcategoryId = _subcategoryIds[subcategory];
    if (subcategoryId != null) {
      return _products.where((p) => p.subcategoryId == subcategoryId).toList();
    }
    return _products.where((p) => p.subcategory == subcategory).toList();
  }

  void _selectPage(int page) {
    if (page == _selectedPage) return;
    _pageController.animateToPage(
      page,
      duration: AppDimens.durationNormal,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Scaffold(
      appBar: AppBar(title: Text(widget.categoryName), centerTitle: true),
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: _loading
            ? _buildLoadingGrid()
            : _error != null
            ? AnimeErrorState(message: _error!, onAction: _load)
            : _products.isEmpty
            ? AnimeEmptyState(
                title: 'لا توجد منتجات',
                subtitle: 'لا توجد منتجات في هذا القسم حالياً',
                icon: Icons.inventory_2_outlined,
              )
            : RefreshIndicator(
                onRefresh: _load,
                child: _subcategories.isEmpty
                    ? _buildProductsScroll(_products)
                    : Column(
                        children: [
                          _buildSubcategoryFilter(),
                          Expanded(
                            child: PageView.builder(
                              controller: _pageController,
                              onPageChanged: (page) =>
                                  setState(() => _selectedPage = page),
                              itemCount: _subcategories.length + 1,
                              itemBuilder: (context, page) =>
                                  _buildProductsScroll(_productsForPage(page)),
                            ),
                          ),
                        ],
                      ),
              ),
      ),
    );
  }

  /// شبكة المنتجات (تُستخدم داخل صفحة المتصفح أو في القسم بلا أقسام فرعية).
  Widget _buildProductsScroll(List<Product> products) {
    if (products.isEmpty) {
      return LayoutBuilder(
        builder: (context, constraints) => RefreshIndicator(
          onRefresh: _load,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              height: constraints.maxHeight,
              child: AnimeEmptyState(
                title: 'لا توجد منتجات',
                subtitle: 'لا توجد منتجات في هذا القسم الفرعي بعد',
                icon: Icons.search_off_outlined,
              ),
            ),
          ),
        ),
      );
    }
    return GridView.builder(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      physics: const AlwaysScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: AppDimens.space3,
        crossAxisSpacing: AppDimens.space3,
        childAspectRatio: 0.7,
      ),
      itemCount: products.length,
      itemBuilder: (context, index) {
        final product = products[index];
        return ProductCard(
          product: product,
          onTap: () =>
              context.router.push(ProductDetailRoute(productId: product.id)),
          onFavoriteToggle: () =>
              context.read<FavoritesCubit>().toggle(product),
        );
      },
    );
  }

  Widget _buildSubcategoryFilter() {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        itemCount: _subcategories.length + 1,
        separatorBuilder: (_, _) => SizedBox(width: AppDimens.space2),
        itemBuilder: (context, index) {
          if (index == 0) {
            return AnimeChoiceChip(
              label: 'الكل',
              selected: _selectedPage == 0,
              onSelected: (selected) {
                if (selected) _selectPage(0);
              },
            );
          }
          final subcategory = _subcategories[index - 1];
          return AnimeChoiceChip(
            label: subcategory,
            selected: _selectedPage == index,
            onSelected: (selected) {
              if (selected) _selectPage(index);
            },
          );
        },
      ),
    );
  }

  Widget _buildLoadingGrid() {
    return GridView.builder(
      padding: EdgeInsets.all(AppDimens.screenHorizontalPadding),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisSpacing: AppDimens.space3,
        crossAxisSpacing: AppDimens.space3,
        childAspectRatio: 0.7,
      ),
      itemCount: 6,
      itemBuilder: (context, index) => _buildProductSkeleton(),
    );
  }

  Widget _buildProductSkeleton() {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Theme.of(context).colorScheme.outlineVariant,
                    Theme.of(context).colorScheme.surfaceContainerHighest,
                  ],
                ),
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(AppDimens.cardBorderRadius),
                ),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.all(AppDimens.cardPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSkeletonLine(width: 1.0, height: 16),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.7, height: 14),
                SizedBox(height: AppDimens.space2),
                _buildSkeletonLine(width: 0.5, height: 14),
              ],
            ),
          ),
        ],
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
