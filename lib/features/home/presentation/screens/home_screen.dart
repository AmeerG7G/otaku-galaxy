import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/gender.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/locale_refetch.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/auth/require_auth.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/utils/request_sequence.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../connectivity/presentation/reconnect_refetch.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../../notifications/presentation/cubit/notifications_cubit.dart';
import '../../../products/domain/entities/home_data.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_home_usecase.dart';
import '../../../products/domain/usecases/fetch_products_usecase.dart';
import '../widgets/home_compositions.dart';
import '../widgets/product_card.dart';
import '../widgets/product_section.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../products/domain/entities/banner.dart' as model;

@RoutePage()
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen>
    with LocaleRefetch, ReconnectRefetch {
  late Future<HomeData> _future;

  // اكتشف المنتجات: تغذية مستمرة بمنتجات عشوائية عند التمرير.
  final List<Product> _explore = [];
  int _explorePage = 0;
  bool _loadingMore = false;
  bool _hasMore = true;

  /// طلبات «تحميل المزيد» — كلّ إعادة جلبٍ للرئيسية تتجاوز الجاري منها.
  final _exploreRequests = RequestSequence();

  @override
  void initState() {
    super.initState();
    _future = context.read<FetchHomeUsecase>()();
  }

  /// الرئيسية كلها محتوى خادمي مصرَّف (أقسام، بانرات، أسماء منتجات) —
  /// تُعاد بلغة الواجهة الجديدة بنفس مسار السحب للتحديث.
  @override
  void onLanguageChanged() => _reload();

  /// عاد الاتصال بعد انقطاع: ما على الشاشة صُنع قبله أو أثناءه (طلبٌ فشل،
  /// صورٌ بقي مكانها البديل) — جيلٌ جديد يستبدله كلّه.
  @override
  void onReconnected() => _reload();

  /// يبدأ جيلاً جديداً من الرئيسية: طلبٌ جديد، وتغذية «اكتشف» من الصفر.
  ///
  /// [CRITICAL] المسار الوحيد لإعادة الجلب — السحب للتحديث، تبديل اللغة،
  /// «إعادة المحاولة»، عودة الاتصال. كانت صفحات «اكتشف» المحمَّلة وعدّادها
  /// تعيش خارج الطلب الذي يملكها: لا تُصفَّر، فتُعرض نماذج منتجاتٍ من الجلب
  /// السابق (بصورها وأسعارها وأسمائها القديمة) بجانب الجديد — أو وحدها بعد
  /// فشل — و«تحميل المزيد» الجاري يُلحِق صفحةً من الجيل السابق بعد وصول
  /// الجديد. `_exploreRequests.next()` يُسقط ذلك الردّ حين يصل.
  ///
  /// و`setState` بجسمٍ لا بسهم: السهم كان يعيد الـ`Future` المُسنَد، فيرمي
  /// `setState` تأكيداً في التطوير قبل أن يُعلِّم الشاشة للبناء — فلا تُعاد
  /// الرئيسية بعد تبديل اللغة.
  Future<HomeData> _reload() {
    _exploreRequests.next();
    final future = context.read<FetchHomeUsecase>()();
    setState(() {
      _future = future;
      _explore.clear();
      _explorePage = 0;
      _hasMore = true;
      _loadingMore = false;
    });
    return future;
  }

  Future<void> _loadMoreExplore() async {
    if (_loadingMore || !_hasMore) return;
    // رقم هذا الطلب قبل أي `await`؛ إعادة جلبٍ أثناءه تجعله متجاوَزاً.
    final token = _exploreRequests.next();
    setState(() => _loadingMore = true);
    try {
      final fetchProducts = context.read<FetchProductsUsecase>();
      final page = await fetchProducts(page: _explorePage + 1, limit: 6);
      if (!mounted || !_exploreRequests.isCurrent(token)) return;
      setState(() {
        _explore.addAll(page.items);
        _explorePage++;
        _hasMore = page.hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted || !_exploreRequests.isCurrent(token)) return;
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
      // [CRITICAL] `bottom: false` — كالتبويبات الأربعة الأخرى.
      //
      // الغلاف الرئيسي يستعمل `extendBody: true`، فيُبلغ Scaffold جسمَه أن
      // الحشوة السفلية تساوي ارتفاع شريط التنقّل. و`SafeArea` الافتراضية
      // (bottom: true) تستهلك تلك الحشوة، فيتوقّف محتوى الرئيسية **فوق**
      // الشريط ويظهر تحته شريطٌ فارغ بلون الخلفية يحيط بالشريط العائم —
      // وهو «السطح الفاتح المحيط». الأقسام والمجتمع والسلة والحساب كلها
      // تمرّر `bottom: false` منذ البداية، فيمرّ محتواها خلف الشريط؛
      // الرئيسية وحدها كانت شاذّة.
      bottom: false,
      child: Column(
        children: [
          _buildBrandHeaderWithSearch(),

          // المحتوى القابل للتمرير
          Expanded(
            child: FutureBuilder<HomeData>(
              future: _future,
              builder: (context, snapshot) {
                // [CRITICAL] الانتظار أولاً: `FutureBuilder` يُبقي بيانات
                // الطلب السابق **وخطأه** ما دام الجديد معلّقاً
                // (`AsyncSnapshot.inState`)، فأيّ ترتيبٍ آخر يعرض أثناء
                // إعادة المحاولة الخطأَ القديم أو البيانات القديمة.
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _buildLoadingState();
                }
                if (snapshot.hasError) {
                  return _buildErrorState(snapshot.error!);
                }
                final data = snapshot.requireData;
                return RefreshIndicator(
                  onRefresh: () async {
                    try {
                      await _reload();
                    } catch (_) {
                      // الفشل تعرضه حالة الخطأ أعلاه؛ المؤشّر يكتفي بانتهاء
                      // الطلب.
                    }
                  },
                  child: NotificationListener<ScrollNotification>(
                    onNotification: _onScrollNotification,
                    child: CustomScrollView(
                      slivers: [
                        // تركيبة البطل (تدرّج + شخصية تكسر الحافة)
                        SliverToBoxAdapter(
                          child: HomeHeroCard(
                            banner: data.heroBanner,
                            onShop: () => _openBanner(data.heroBanner),
                          ),
                        ),

                        // بطاقات ترويجية — بطاقة الخصومات تظهر فقط عند
                        // وجود خصم حقيقي في الكتالوج، وبنسبته الفعلية.
                        SliverToBoxAdapter(
                          child: HomePromoRail(
                            maxDiscount: _maxDiscountOf(data),
                            banners: data.promoBanners,
                            onOpenBanner: _openBanner,
                            onTap: () =>
                                mainNavIndex.value = MainTab.categories,
                          ),
                        ),

                        // العروض
                        if (data.offers.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: context.strings('offers'),
                              products: data.offers,
                              onSeeAll: () =>
                                  mainNavIndex.value = MainTab.categories,
                            ),
                          ),

                        // منتجات مختارة
                        if (data.selectedProducts.isNotEmpty)
                          SliverToBoxAdapter(
                            child: ProductSection(
                              title: context.strings('selectedProducts'),
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
                            gridDelegate: productGridDelegate(context),
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
  ///
  /// [CRITICAL] لا سطح محيطاً بالترويسة — لا حاوية ملوّنة ولا هالة ولا قصّ.
  ///
  /// كان هنا `Stack` يحمل هالةً بنفسجية دائرية (٢٥٠×٢٥٠، `primary` بشفافية
  /// ٢٠٪) موضوعةً خارج الحدود (`top:-96, end:-70`)، والحاوية الأم تقصّ
  /// بـ`Clip.hardEdge`. والقصّ هو ما صنع المشكلة: هالةٌ ناعمة الأطراف
  /// تُقصّ بحدٍّ حادّ عند حافة الترويسة، فتظهر **مستطيلاً شفافاً مائلاً
  /// للبنفسجي** يحيط بالشعار والاسم والجرس وحقل البحث معاً. `BoxDecoration()`
  /// الفارغة كانت تُوهم بأن لا سطح هناك، والسطح كان الهالةَ المقصوصة لا
  /// الحاوية.
  ///
  /// أُزيلت الهالة والقصّ معاً. ما بقي: الحشوة نفسها (١٨/١٨/١٨/٠) والعناصر
  /// نفسها بترتيبها ومسافاتها — الشعار، الاسم، الجرس، وبطاقة البحث — مرسومةً
  /// مباشرةً على خلفية الشاشة.
  Widget _buildBrandHeaderWithSearch() {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
      child: Column(
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
                      context.strings('welcomeTo'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    Text(
                      context.strings('brandName'),
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
              // وليست عنصراً داخل الحساب. سطحها الخاص (٤٢×٤٢) يبقى — هو
              // زرٌّ مستقل لا جزءٌ من سطحٍ محيط.
              const _NotificationsBell(),
            ],
          ),
          const SizedBox(height: 15),
          _buildSearchCta(),
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
                AppIcons.search,
                size: 17,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              context.strings('homeSearchHint'),
              style: theme.textTheme.bodyMedium?.copyWith(
                fontSize: 13.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExploreHeader() => SectionHeader(title: context.strings('discover'));

  /// يفتح وجهة البنر التي ضبطها المسؤول.
  ///
  /// [CRITICAL] الوجهة بيانات لا كود. البنر بلا وجهة (أو بوجهة بلا معرّف)
  /// يقود إلى الأقسام كسلوك آمن بدل أن يبتلع الضغطة صامتاً — الزبون ضغط،
  /// فيجب أن يحدث شيء.
  void _openBanner(model.Banner? banner) {
    if (banner == null || !banner.isTappable) {
      mainNavIndex.value = MainTab.categories;
      return;
    }
    final value = banner.destinationValue!.trim();
    switch (banner.destination) {
      case model.BannerDestination.product:
        context.router.push(ProductDetailRoute(productId: value));
      case model.BannerDestination.category:
      case model.BannerDestination.subcategory:
      case model.BannerDestination.anime:
        // الأقسام والأنمي يُفتحان من تبويب الأقسام: لا مسار مباشر لهما في
        // الرواتر الحالي، وابتكار واحد هنا يخرج عن نطاق هذا التغيير.
        mainNavIndex.value = MainTab.categories;
      case model.BannerDestination.none:
        mainNavIndex.value = MainTab.categories;
    }
  }

  /// فشل جلب الرئيسية — حالة خطأ ظاهرة بزرّ «إعادة المحاولة».
  ///
  /// [CRITICAL] كان الفشل يُعرض نجاحاً فارغاً (`snapshot.data ?? HomeData()`):
  /// البطل المضمَّن برسم شخصيته ونصّه الافتراضي مكان بنر المسؤول، بلا عروض
  /// ولا مختارات — شاشةٌ تبدو بيانات وليست كذلك، ولا زرّ يعيد المحاولة. كل
  /// شاشة محتوى أخرى تفصل الفشل عن «لا بيانات»؛ الرئيسية كانت الشاذّة.
  Widget _buildErrorState(Object error) {
    final message = error is AppException
        ? error.localizedMessage(context).trim()
        : '';
    return AnimeErrorState(
      message: message.isNotEmpty ? message : context.strings('unexpectedError'),
      onAction: _reload,
    );
  }

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
    if (!await requireAuthentication(
      context,
      title: context.gNow(GenderedStrings.loginFirst),
      body: context.strings('loginRequiredForNotifications'),
    )) {
      return;
    }
    if (mounted) context.router.push(const NotificationsRoute());
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<NotificationsCubit, NotificationsState>(
      builder: (context, state) {
        // الجرس مرئي للزائر أيضاً: لمسه يفتح البوابة الموحّدة «سجّل دخولك
        // أولاً» (تُنفَّذ في `_open`)، والشارة لا تُعرض إلّا لحساب مسجّل.
        final isLoggedIn = context.select<AuthCubit, bool>(
          (cubit) => cubit.state is AuthAuthenticated,
        );
        final unread = isLoggedIn ? state.unreadCount : 0;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            // جرس الإشعارات بمقاس المرجع تماماً: ٤٢×٤٢ بحواف ١٥ وسطح
            // أبيض بحدّ وظلّ ناعم (home header: width/height 42, radius 15).
            Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(15),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
                boxShadow: context.themeColors.shadowXSoft,
              ),
              child: IconButton(
                onPressed: _open,
                icon: const Icon(
                  Icons.notifications_none_rounded,
                  size: 22,
                ),
                tooltip: context.strings('notifications'),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 42,
                  height: 42,
                ),
              ),
            ),
            if (unread > 0)
              PositionedDirectional(
                top: -4,
                end: -4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  constraints: const BoxConstraints(
                    minWidth: 17,
                    minHeight: 17,
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
                      fontSize: 10,
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
