import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../notifications/presentation/cubit/notifications_cubit.dart';
import '../../../products/domain/entities/category.dart';
import '../../../products/domain/entities/home_data.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_home_usecase.dart';
import '../../../products/domain/usecases/fetch_products_usecase.dart';
import '../widgets/banner_carousel.dart';
import '../widgets/home_compositions.dart';
import '../widgets/product_card.dart';
import '../widgets/product_section.dart';
import '../../../auth/presentation/cubit/auth_state.dart';

@RoutePage()
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HomeData> _future;

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

  /// أعلى نسبة خصم حقيقية بين منتجات الرئيسية — `null` إن لم يوجد خصم.
  int? _maxDiscountOf(HomeData data) {
    final percents = [
      ...data.offers,
      ...data.selectedProducts,
      ...data.discover,
    ].map((p) => p.discountPercent).whereType<int>().where((p) => p > 0);
    return percents.isEmpty ? null : percents.reduce((a, b) => a > b ? a : b);
  }

  /// المنتجات المرئية في قسم اكتشف (بدون تكرار عبر الصفحات).
  List<Product> _visibleExplore(List<Product> seed) {
    final seen = <String>{};
    return [...seed, ..._explore].where((p) => seen.add(p.id)).toList();
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
                        // تركيبة البطل (تدرّج + شخصية تكسر الحافة)
                        SliverToBoxAdapter(
                          child: HomeHeroCard(
                            onShop: () =>
                                mainNavIndex.value = MainTab.categories,
                          ),
                        ),

                        // بطاقات ترويجية — بطاقة الخصومات تظهر فقط عند
                        // وجود خصم حقيقي في الكتالوج، وبنسبته الفعلية.
                        SliverToBoxAdapter(
                          child: HomePromoRail(
                            maxDiscount: _maxDiscountOf(data),
                            onTap: () =>
                                mainNavIndex.value = MainTab.categories,
                          ),
                        ),

                        // بانر المتجر (من الخادم)
                        if (data.banners.isNotEmpty)
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 18),
                              child: BannerCarousel(banners: data.banners),
                            ),
                          ),

                        // العروض
                        if (data.offers.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: 'العروض',
                              products: data.offers,
                              onSeeAll: () =>
                                  mainNavIndex.value = MainTab.categories,
                            ),
                          ),

                        // الأقسام
                        SliverToBoxAdapter(
                          child: _CategoriesSection(
                            categories: data.categories,
                          ),
                        ),

                        // منتجات مختارة
                        if (data.selectedProducts.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: 'منتجات مختارة',
                              products: data.selectedProducts,
                            ),
                          ),

                        // طمأنة التوصيل والدفع عند الاستلام
                        const SliverToBoxAdapter(
                          child: DeliveryAssuranceStrip(),
                        ),

                        // اكتشف المنتجات (تغذية لا نهائية)
                        SliverToBoxAdapter(child: _buildExploreHeader()),
                        SliverPadding(
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          sliver: SliverGrid(
                            gridDelegate: kProductGridDelegate,
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final explore = _visibleExplore(data.discover);
                                final product = explore[index];
                                return ProductCard(
                                  product: product,
                                  onTap: () => context.router.push(
                                    ProductDetailRoute(productId: product.id),
                                  ),
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

  /// ترويسة الرئيسية — الشعار وسطر ترحيب وجرس الإشعارات، ثم بطاقة بحث
  /// قابلة للنقر بدائرة متدرّجة، كما في مصدر تصميم v2.
  Widget _buildBrandHeaderWithSearch() {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
      clipBehavior: Clip.hardEdge,
      decoration: const BoxDecoration(),
      child: Stack(
        children: [
          // هالة بنفسجية ناعمة خلف الترويسة.
          PositionedDirectional(
            top: -96,
            end: -70,
            child: IgnorePointer(
              child: Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.primary.withValues(alpha: 0.20),
                      AppColors.primary.withValues(alpha: 0),
                    ],
                    stops: const [0, 0.66],
                  ),
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const OtakuStoreLogoSimple(size: 46),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'أهلاً بك في',
                          style: theme.textTheme.bodySmall?.copyWith(
                            fontSize: 12,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        Text(
                          'مجرة الأوتاكو',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontFamily: 'Tajawal',
                            fontSize: 18,
                            letterSpacing: -0.2,
                            fontWeight: AppDimens.weightExtraBold,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // الإشعارات تعيش في شريط الرئيسية العلوي بجانب هوية المتجر،
                  // وليست عنصراً داخل الحساب.
                  const _NotificationsBell(),
                ],
              ),
              const SizedBox(height: 15),
              _buildSearchCta(),
            ],
          ),
        ],
      ),
    );
  }

  /// بطاقة البحث — تفتح شاشة البحث بدل حقل داخل الرئيسية.
  Widget _buildSearchCta() {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return InkWell(
      onTap: () => context.router.push(SearchRoute()),
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: Border.all(color: theme.colorScheme.outlineVariant),
          boxShadow: colors.shadowXSoft,
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: const BoxDecoration(
                gradient: AppColors.primaryGradient,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.search_rounded,
                size: 17,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              'دوّر على أي منتج تحبه…',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13.5,
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExploreHeader() => const SectionHeader(title: 'اكتشف المنتجات');

  /// حالة تحميل الرئيسية — هياكل متلألئة بنفس إيقاع الأقسام الحقيقية.
  Widget _buildLoadingState() {
    return ListView(
      padding: const EdgeInsets.only(bottom: 104),
      children: const [
        Padding(
          padding: EdgeInsets.fromLTRB(18, 18, 18, 0),
          child: OtakuSkeleton.box(height: 174, radius: AppDimens.radiusXl),
        ),
        _HomeRailSkeleton(titleWidth: 100, itemHeight: 96, itemWidth: 104),
        _HomeRailSkeleton(titleWidth: 120, itemHeight: 232, itemWidth: 152),
        _HomeRailSkeleton(titleWidth: 140, itemHeight: 232, itemWidth: 152),
      ],
    );
  }
}

class _CategoriesSection extends StatelessWidget {
  const _CategoriesSection({required this.categories});

  final List<Category> categories;

  @override
  Widget build(BuildContext context) {
    // القسم كله داخل حاوية واحدة مع رسم تزييني خلف الترويسة والشريط،
    // كما في كتلة «تسوّق حسب القسم» في مصدر التصميم.
    return ClipRect(
      child: Stack(
        children: [
          PositionedDirectional(
            top: 14,
            end: -34,
            child: IgnorePointer(
              child: Opacity(
                opacity: 0.20,
                child: Image.asset(
                  'assets/art/opt/a-i6.png',
                  width: 112,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              SectionHeader(
                title: 'تسوّق حسب القسم',
                onSeeAll: () => mainNavIndex.value = MainTab.categories,
              ),
              SizedBox(
                height: 100,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 4),
                  itemCount: categories.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 11),
                  itemBuilder: (context, index) {
                    final category = categories[index];
                    return AnimeCategoryCard.rail(
                      category: category,
                      index: index,
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
            ],
          ),
        ],
      ),
    );
  }
}

/// جرس الإشعارات في شريط الرئيسية العلوي — يعرض عدد غير المقروء ويفتح
/// مركز الإشعارات. للزائر يعرض دعوة تسجيل الدخول (الإشعارات خاصية حساب).
class _NotificationsBell extends StatefulWidget {
  const _NotificationsBell();

  @override
  State<_NotificationsBell> createState() => _NotificationsBellState();
}

class _NotificationsBellState extends State<_NotificationsBell> {
  @override
  void initState() {
    super.initState();
    if (context.read<AuthCubit>().isLoggedIn) {
      context.read<NotificationsCubit>().load();
    }
  }

  Future<void> _open() async {
    if (!context.read<AuthCubit>().isLoggedIn) {
      final wantsLogin = await showLoginGate(
        context,
        title: 'سجّل دخولك أولاً',
        body: 'الإشعارات تحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
      );
      if (wantsLogin && mounted) {
        context.router.push(const LoginRoute());
      }
      return;
    }
    if (mounted) context.router.push(const NotificationsRoute());
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<NotificationsCubit, NotificationsState>(
      builder: (context, state) {
        final isLoggedIn = context.select<AuthCubit, bool>(
          (cubit) => cubit.state is AuthAuthenticated,
        );
        // الزائر بلا إشعارات أصلاً — إظهار جرس لا يفعل سوى طلب الدخول
        // يجعل التصفّح يبدو محاصَراً، فنُخفيه بدل ذلك.
        if (!isLoggedIn) return const SizedBox.shrink();
        final unread = state.unreadCount;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: IconButton(
                onPressed: _open,
                icon: const Icon(Icons.notifications_none_rounded),
                tooltip: 'الإشعارات',
              ),
            ),
            if (unread > 0)
              PositionedDirectional(
                top: -2,
                end: -2,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  constraints: const BoxConstraints(
                    minWidth: 18,
                    minHeight: 18,
                  ),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.secondary,
                    borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                    border: Border.all(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      width: 2,
                    ),
                  ),
                  child: Text(
                    unread > 9 ? '9+' : '$unread',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: Colors.white,
                      fontSize: 9,
                      height: 1,
                      fontWeight: AppDimens.weightBold,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// هيكل قسم أفقي في الرئيسية أثناء التحميل.
class _HomeRailSkeleton extends StatelessWidget {
  const _HomeRailSkeleton({
    required this.titleWidth,
    required this.itemHeight,
    required this.itemWidth,
  });

  final double titleWidth;
  final double itemHeight;
  final double itemWidth;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 26, 18, 12),
          child: OtakuSkeleton(width: titleWidth, height: 18, radius: 8),
        ),
        SizedBox(
          height: itemHeight,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            itemCount: 4,
            separatorBuilder: (_, _) => const SizedBox(width: 13),
            itemBuilder: (_, _) => OtakuSkeleton.box(
              width: itemWidth,
              height: itemHeight,
              radius: AppDimens.radiusMd,
            ),
          ),
        ),
      ],
    );
  }
}
