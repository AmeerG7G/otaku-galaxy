import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/entities/home_data.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_home_usecase.dart';
import '../../../products/domain/usecases/fetch_products_usecase.dart';
import '../widgets/banner_carousel.dart';
import '../widgets/product_card.dart';
import '../widgets/product_section.dart';

@RoutePage()
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HomeData> _future;
  final _searchController = TextEditingController();

  // اكتشف المنتجات: تغذية مستمرة بمنتجات عشوائية عند التمرير.
  final List<Product> _explore = [];
  int _explorePage = 0;
  bool _loadingMore = false;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _future = context.read<FetchHomeUsecase>()();
  }

  void _onSubmitted(String value) {
    if (value.trim().isEmpty) return;
    context.router.push(SearchRoute(initialQuery: value.trim()));
  }

  Future<void> _loadMoreExplore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final fetchProducts = context.read<FetchProductsUsecase>();
      final page = await fetchProducts(page: _explorePage + 1, limit: 6);
      if (!mounted) return;
      setState(() {
        _explore.addAll(page.items);
        _explorePage++;
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
    }
  }

  bool _onScrollNotification(ScrollNotification notification) {
    if (notification.metrics.pixels >=
        notification.metrics.maxScrollExtent - 600) {
      _loadMoreExplore();
    }
    return false;
  }

  /// المنتجات المرئية في قسم اكتشف (بدون تكرار عبر الصفحات).
  List<Product> _visibleExplore(List<Product> seed) {
    final seen = <String>{};
    return [...seed, ..._explore].where((p) => seen.add(p.id)).toList();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _buildBrandHeaderWithSearch(),

          // المحتوى القابل للتمرير
          Expanded(
            child: FutureBuilder<HomeData>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingState();
                }
                final data = snapshot.data ?? const HomeData();
                return RefreshIndicator(
                  onRefresh: () async {
                    setState(() {
                      _future = context.read<FetchHomeUsecase>()();
                    });
                    await _future;
                  },
                  child: NotificationListener<ScrollNotification>(
                    onNotification: _onScrollNotification,
                    child: CustomScrollView(
                      slivers: [
                        // بانر إعلاني
                        SliverToBoxAdapter(
                          child: BannerCarousel(banners: data.banners),
                        ),

                        // العروض
                        if (data.offers.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: 'العروض',
                              products: data.offers,
                              showBadge: true,
                              badgeType: BadgeType.offer,
                            ),
                          ),

                        // منتجات مختارة
                        if (data.selectedProducts.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: 'منتجات مختارة',
                              products: data.selectedProducts,
                              showBadge: true,
                              badgeType: BadgeType.featured,
                            ),
                          ),

                        // الأقسام
                        SliverToBoxAdapter(
                          child: _CategoriesSection(
                            categories: data.categories,
                          ),
                        ),

                        // اكتشف المنتجات (تغذية لا نهائية)
                        SliverToBoxAdapter(child: _buildExploreHeader()),
                        SliverPadding(
                          padding: EdgeInsets.symmetric(
                            horizontal: AppDimens.screenHorizontalPadding,
                          ),
                          sliver: SliverGrid(
                            gridDelegate:
                                const SliverGridDelegateWithMaxCrossAxisExtent(
                                  maxCrossAxisExtent: 220,
                                  mainAxisSpacing: AppDimens.space3,
                                  crossAxisSpacing: AppDimens.space3,
                                  childAspectRatio: 0.7,
                                ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final explore = _visibleExplore(data.discover);
                                final product = explore[index];
                                return ProductCard(
                                  product: product,
                                  onTap: () => context.router.push(
                                    ProductDetailRoute(productId: product.id),
                                  ),
                                  onFavoriteToggle: () => context
                                      .read<FavoritesCubit>()
                                      .toggle(product),
                                );
                              },
                              childCount: _visibleExplore(data.discover).length,
                            ),
                          ),
                        ),
                        if (_loadingMore)
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: AppDimens.space4,
                              ),
                              child: Center(
                                child: SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.5,
                                  ),
                                ),
                              ),
                            ),
                          ),

                        // مساحة أسفل للتنقل
                        SliverToBoxAdapter(
                          child: SizedBox(height: AppDimens.space10),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBrandHeaderWithSearch() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppDimens.screenHorizontalPadding,
        AppDimens.space4,
        AppDimens.screenHorizontalPadding,
        AppDimens.space3,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const OtakuStoreLogoSimple(size: 44),
              const SizedBox(width: AppDimens.space3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'مجرة الأوتاكو',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: AppDimens.weightExtraBold,
                      ),
                    ),
                    Text(
                      'كل ما تحبه من عالم الأنمي',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: AppDimens.space3),
          _buildSearchBar(),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
          width: AppDimens.cardBorderWidth,
        ),
      ),
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        onSubmitted: _onSubmitted,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(fontWeight: AppDimens.weightMedium),
        decoration: InputDecoration(
          hintText: 'ابحث عن منتج...',
          hintStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(
              context,
            ).colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
          ),
          prefixIcon: Padding(
            padding: EdgeInsets.all(AppDimens.space3),
            child: Icon(
              Icons.search,
              size: AppDimens.iconMd,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: Icon(
                    Icons.clear,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  onPressed: () {
                    _searchController.clear();
                    setState(() {});
                  },
                )
              : IconButton(
                  icon: Icon(
                    Icons.arrow_back_ios,
                    size: AppDimens.iconSm,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  onPressed: () => _onSubmitted(_searchController.text),
                ),
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(
            horizontal: AppDimens.space4,
            vertical: AppDimens.space3,
          ),
        ),
        onChanged: (_) => setState(() {}),
      ),
    );
  }

  Widget _buildExploreHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppDimens.screenHorizontalPadding,
        AppDimens.space6,
        AppDimens.screenHorizontalPadding,
        AppDimens.space3,
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'اكتشف المنتجات',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: AppDimens.weightBold,
                ),
              ),
              SizedBox(height: AppDimens.space1),
              Text(
                'تابع التمرير لاكتشاف المزيد',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingState() {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: BannerCarousel(banners: const [])),
        SliverToBoxAdapter(child: _buildSectionSkeleton('العروض')),
        SliverToBoxAdapter(child: _buildSectionSkeleton('منتجات مختارة')),
        SliverToBoxAdapter(child: _buildCategoriesSkeleton()),
        SliverToBoxAdapter(child: _buildSectionSkeleton('اكتشف المنتجات')),
      ],
    );
  }

  Widget _buildSectionSkeleton(String title) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppDimens.screenHorizontalPadding,
            AppDimens.space6,
            AppDimens.screenHorizontalPadding,
            AppDimens.space3,
          ),
          child: Container(
            height: 24,
            width: 120,
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
        ),
        SizedBox(
          height: 240,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            itemCount: 3,
            separatorBuilder: (_, _) => SizedBox(width: AppDimens.space3),
            itemBuilder: (context, index) => _buildProductCardSkeleton(),
          ),
        ),
        SizedBox(height: AppDimens.space6),
      ],
    );
  }

  Widget _buildProductCardSkeleton() {
    return Container(
      width: AppDimens.productCardWidth,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.cardBorderRadius),
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
                Container(
                  height: 16,
                  width: double.infinity,
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
                SizedBox(height: AppDimens.space2),
                Container(
                  height: 14,
                  width: 80,
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
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoriesSkeleton() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppDimens.screenHorizontalPadding,
            AppDimens.space6,
            AppDimens.screenHorizontalPadding,
            AppDimens.space3,
          ),
          child: Container(
            height: 24,
            width: 80,
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
        ),
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            itemCount: 5,
            separatorBuilder: (_, _) => SizedBox(width: AppDimens.space3),
            itemBuilder: (context, index) => _buildCategoryCardSkeleton(),
          ),
        ),
        SizedBox(height: AppDimens.space6),
      ],
    );
  }

  Widget _buildCategoryCardSkeleton() {
    return Container(
      width: AppDimens.categoryCardSize,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusLg),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: AppDimens.categoryIconSize * 1.5,
            height: AppDimens.categoryIconSize * 1.5,
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
          SizedBox(height: AppDimens.space3),
          Container(
            height: 12,
            width: 60,
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
        ],
      ),
    );
  }
}

class _CategoriesSection extends StatelessWidget {
  const _CategoriesSection({required this.categories});

  final List<Category> categories;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppDimens.screenHorizontalPadding,
            AppDimens.space6,
            AppDimens.screenHorizontalPadding,
            AppDimens.space3,
          ),
          child: Row(
            children: [
              Text(
                'الأقسام',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: AppDimens.weightBold,
                ),
              ),
              const Spacer(),
              AnimeTextButton(
                label: 'الكل',
                onPressed: () => context.router.push(
                  CategoryProductsRoute(
                    categoryId: 'all',
                    categoryName: 'جميع الأقسام',
                  ),
                ),
                icon: Icons.arrow_back_ios,
                iconPosition: IconPosition.end,
              ),
            ],
          ),
        ),
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.symmetric(
              horizontal: AppDimens.screenHorizontalPadding,
            ),
            itemCount: categories.length,
            separatorBuilder: (_, _) => SizedBox(width: AppDimens.space3),
            itemBuilder: (context, index) {
              final category = categories[index];
              return AnimeCategoryCard(
                category: category,
                size: AppDimens.categoryCardSize,
                onTap: () => context.router.push(
                  CategoryProductsRoute(
                    categoryId: category.id,
                    categoryName: category.name,
                  ),
                ),
              );
            },
          ),
        ),
        SizedBox(height: AppDimens.space6),
      ],
    );
  }
}
