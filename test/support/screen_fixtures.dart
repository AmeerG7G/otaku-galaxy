// تركيب الشاشات الحقيقية لاختبارات الهندسة بين اللغتين.
//
// كل شاشة تُبنى كما في التطبيق: الغلاف الحقيقي بتبويباته الخمسة، أو الشاشة
// المدفوعة نفسها، أو شاشات المصادقة عبر الرواتر. اللغة تُحقن بـ`LocaleScope`
// (ما يقرأه `context.strings`) وتكبير الخط بـ`MediaQuery` — بلا أي فرعٍ
// خاصّ بالاختبار داخل `lib/`.
//
// البيانات الوهمية عربيةٌ عمداً: أسماء المنتجات والأقسام محتوى خادم، لا نصّ
// واجهة؛ إبقاؤها واحدةً في اللغتين يعزل ما تقيسه الاختبارات — نصوص الواجهة.

import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/bilingual_text.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/collections/domain/entities/collection.dart';
import 'package:otaku_galaxy/features/collections/domain/repositories/collection_repository.dart';
import 'package:otaku_galaxy/features/collections/presentation/cubit/collections_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/onboarding/data/onboarding_storage.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_checkout_quote_usecase.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_order_details_usecase.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/place_order_usecase.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/governorate.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/governorate_repository.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_category_products_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_governorates_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_products_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/search_products_usecase.dart';
import 'package:otaku_galaxy/features/restock/data/restock_repository.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/search/data/search_history_storage.dart';
import 'package:otaku_galaxy/features/settings/data/notification_prefs_repository.dart';
import 'package:otaku_galaxy/features/settings/data/notification_prefs_storage.dart';
import 'package:otaku_galaxy/features/settings/data/personalize_storage.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'auth_stub.dart';

/// مقاس منطقي وتكبير خط — حالة قياسٍ واحدة.
class GeoView {
  const GeoView(this.size, this.textScale);

  final Size size;
  final double textScale;

  @override
  String toString() =>
      '${size.width.toInt()}x${size.height.toInt()}@${textScale.toStringAsFixed(1)}';
}

/// المقاسات المطلوبة في العقد.
const kGeoViews = <GeoView>[
  GeoView(Size(412, 892), 1.0),
  GeoView(Size(412, 892), 1.3),
  GeoView(Size(375, 812), 1.0),
  GeoView(Size(320, 568), 1.3),
];

/// مقاسات «المحتوى الكامل»: العرض نفسه، وارتفاعٌ يبني ما تحت الطيّة
/// (القوائم الكسولة لا تبني ما لا يُرى).
const kGeoFullContentViews = <GeoView>[
  GeoView(Size(412, 3000), 1.3),
  GeoView(Size(320, 3000), 1.3),
];

/// شريط الحالة المحاكى.
const double kStatusBar = 24;

void useGeoView(WidgetTester tester, GeoView view) {
  tester.view.physicalSize = view.size;
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = const FakeViewPadding(top: kStatusBar);
  tester.view.viewPadding = const FakeViewPadding(top: kStatusBar);
  addTearDown(tester.view.reset);
}

// ── بيانات وهمية ─────────────────────────────────────────────────────────

/// منتجٌ بلغتين كما في الكتالوج بعد الهجرة ٠٦٦ (اسم ووصف عربي وكردي).
///
/// [NOTE] (البوّابة ٧، 2026-10-10) كان بلا كردية، فتعرض الكردية تنبيه «لم
/// يُكتب بالكردية بعد» في تفاصيل المنتج — فرقٌ دلالي مقصود يُدخل عنصراً
/// غير موجود بالعربية ويُنزل كل ما تحته، فلا يقيس الهندسة. التنبيه نفسه
/// يحرسه `bilingual_product_content_test.dart` (يظهر بالكردية وحدها حين تغيب).
Product fixtureProduct(int i) => Product(
  id: 'p$i',
  nameAr: 'منتج $i',
  descriptionAr: 'وصف المنتج $i',
  nameCkb: 'بەرهەمی $i',
  descriptionCkb: 'وەسفی بەرهەمی $i',
  price: 5000 + i * 250,
  images: const [],
  stock: 9,
  categoryId: 'c1',
);

/// معرّف منتجٍ نفد مخزونه — تفاصيله تعرض زرّ «أعلمني عند توفره» (التوفّر).
const fixtureOutOfStockId = 'p-out';

Product fixtureOutOfStockProduct() => Product(
  id: fixtureOutOfStockId,
  nameAr: 'منتج نافد',
  descriptionAr: 'وصف المنتج النافد',
  nameCkb: 'بەرهەمی تەواوبوو',
  descriptionCkb: 'وەسفی بەرهەمی تەواوبوو',
  price: 6000,
  images: const [],
  stock: 0,
  categoryId: 'c1',
);

/// بيانات طلبٍ جاهزة لشاشة المراجعة.
OrderData fixtureOrderData() => OrderData(
  governorateId: 'g1',
  province: 'بغداد',
  deliveryCost: 5000,
  fullAddress: 'الكرادة، شارع ٦٢',
  phone: '07701234567',
  items: [
    CartItem(product: fixtureProduct(1)),
    CartItem(product: fixtureProduct(2), quantity: 2),
  ],
);

class FixtureGovernorates implements GovernorateRepository {
  @override
  Future<List<Governorate>> fetchGovernorates() async => const [
    Governorate(id: 'g1', name: 'بغداد', deliveryFee: 5000),
    Governorate(id: 'g2', name: 'البصرة', deliveryFee: 7000),
  ];
  /// بغداد مقسّمةٌ إلى مناطق — لتُقاس ورقة المنطقة؛ المحافظة غير مختارة عند
  /// فتح الشاشة، فلا يتغيّر شيءٌ قبل اختيارها.
  @override
  Future<List<DeliveryZone>> fetchZones(String governorateId) async =>
      governorateId == 'g1'
      ? const [
          DeliveryZone(id: 'z1', name: 'الكرادة', deliveryFee: 5000),
          DeliveryZone(id: 'z2', name: 'المنصور', deliveryFee: 6000),
        ]
      : const [];
}

List<Category> fixtureCategories(int n) => [
  for (var i = 0; i < n; i++) Category(id: 'c$i', name: 'قسم $i'),
];

Review fixturePhoto(int i) => Review(
  id: 'r$i',
  productId: 'p$i',
  productNames: BilingualText(ar: 'منتج $i'),
  orderId: 'o$i',
  rating: 5,
  comment: 'رائع',
  status: ReviewStatus.approved,
  customerName: 'زبون $i',
  createdAt: DateTime(2026, 9, 1),
);

Order fixtureOrder(OrderStatus status, {String id = 'o1'}) => Order(
  id: id,
  number: '1001',
  province: 'بغداد',
  deliveryCost: 5000,
  fullAddress: 'الكرادة',
  phone: '+9647701234567',
  total: 30000,
  status: status,
  items: [
    CartItem(product: fixtureProduct(1)),
    CartItem(product: fixtureProduct(2), quantity: 2),
  ],
  canReview: true,
  reviewableProductCount: 1,
  createdAt: DateTime(2026, 9, 1),
);

HomeData fixtureHome() => HomeData(
  categories: fixtureCategories(6),
  offers: [for (var i = 0; i < 4; i++) fixtureProduct(i)],
  selectedProducts: [for (var i = 4; i < 8; i++) fixtureProduct(i)],
  discover: [for (var i = 0; i < 6; i++) fixtureProduct(i)],
);

class FixtureCatalog implements ProductRepository {
  FixtureCatalog({HomeData? home}) : home = home ?? fixtureHome();

  final HomeData home;

  @override
  Future<List<Category>> fetchCategories() async => fixtureCategories(6);
  @override
  Future<HomeData> fetchHome() async => home;
  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => ProductPage(
    items: [for (var i = 0; i < 6; i++) fixtureProduct(i)],
    hasMore: false,
  );
  /// (البوّابة ١٥، 2026-10-12) كان غائباً هو ومزوّد حالة استخدامه، فكانت
  /// حالة `category-products` تقيس صفحة خطأ المزوّد لا شبكة المنتجات.
  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async => [for (var i = 0; i < 6; i++) fixtureProduct(i)];
  @override
  Future<Product> fetchProductDetails(String id) async =>
      id == fixtureOutOfStockId
      ? fixtureOutOfStockProduct()
      : fixtureProduct(int.tryParse(id.substring(1)) ?? 1);
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixtureCart implements CartRepository {
  FixtureCart(this.items);

  final List<CartItem> items;

  @override
  Future<List<CartItem>> fetchCart() async => items;
  @override
  Future<CartSnapshot> syncCart() async => CartSnapshot(items: items);
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixtureReviews implements ReviewRepository {
  FixtureReviews([this.photos = const []]);

  final List<Review> photos;

  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async =>
      photos;
  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  Future<Review?> findReview({
    required String orderId,
    required String productId,
  }) async => null;
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async =>
      const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixtureOrders implements OrderRepository {
  FixtureOrders(this.orders);

  final List<Order> orders;

  @override
  Future<Order?> fetchPendingConfirmation() async => null;
  @override
  Future<List<Order>> fetchMyOrders() async => orders;
  @override
  Future<Order> fetchOrderDetails(String id) async =>
      orders.firstWhere((o) => o.id == id, orElse: () => orders.first);
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _NoSettings implements StoreSettingsRepository {
  @override
  StoreSocialLinks get links => const StoreSocialLinks();
  @override
  Future<StoreSocialLinks> refresh() => Completer<StoreSocialLinks>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _NoBirthday implements BirthdayStorage {
  @override
  final ValueNotifier<int> revision = ValueNotifier<int>(0);
  @override
  bool get hasBirthday => false;
  @override
  bool get isBirthdayToday => false;
  @override
  bool get isRewardAvailable => false;
  @override
  bool get isUnlocked => false;
  @override
  int get discountPercent => 10;
  @override
  int? get day => null;
  @override
  int? get month => null;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _NoRestock implements RestockRepository {
  @override
  Future<List<RestockWaiting>> mine() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixturePoints implements PointsRepository {
  @override
  Future<PointsSummary> fetchSummary() async =>
      const PointsSummary(balance: 1250);
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixtureCollections implements CollectionRepository {
  @override
  Future<List<Collection>> fetchAll() async => const [
    Collection(id: 'k1', name: 'مجموعتي', productIds: ['p1', 'p2']),
  ];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class FixtureNotifications implements NotificationRepository {
  @override
  Future<List<AppNotification>> fetchAll() async => [
    AppNotification(
      id: 'n1',
      type: NotificationType.orderAccepted,
      title: 'تم قبول طلبك',
      body: 'طلبك قيد التجهيز الآن',
      createdAt: DateTime(2026, 9, 1),
    ),
  ];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _NoPrefs implements NotificationPrefsRepository {
  @override
  Map<NotificationPref, bool> cached() => const {};
  @override
  Future<Map<NotificationPref, bool>> fetch() async => const {};
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

// ── التركيب ──────────────────────────────────────────────────────────────

const _delegates = [
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

Widget Function(BuildContext, Widget?) _scope(
  AppLanguage language,
  double textScale,
) => (context, child) => LocaleScope(
  language: language,
  child: MediaQuery(
    data: MediaQuery.of(
      context,
    ).copyWith(textScaler: TextScaler.linear(textScale)),
    child: child ?? const SizedBox.shrink(),
  ),
);

/// يسجّل الخدمات ويبني الشجرة الكاملة حول [home] — كما في التطبيق.
Future<void> pumpFixtureApp(
  WidgetTester tester, {
  required Widget home,
  required AppLanguage language,
  required double textScale,
  bool loggedIn = true,
  List<Review> photos = const [],
  List<CartItem>? cartItems,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final orders = FixtureOrders([
    fixtureOrder(OrderStatus.completed),
    fixtureOrder(OrderStatus.pending, id: 'o2'),
    fixtureOrder(OrderStatus.processing, id: 'o3'),
  ]);
  final sl = GetIt.I;
  sl.registerSingleton<OrderRepository>(orders);
  sl.registerSingleton<BirthdayStorage>(_NoBirthday());
  sl.registerSingleton<StoreSettingsRepository>(_NoSettings());
  sl.registerSingleton<AppConfig>(AppConfig.development);
  sl.registerSingleton<PointsRepository>(FixturePoints());
  sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
  sl.registerSingleton<PersonalizeStorage>(PersonalizeStorage(prefs));
  sl.registerSingleton<OnboardingStorage>(OnboardingStorage(prefs));
  sl.registerSingleton<NotificationPrefsRepository>(_NoPrefs());
  sl.registerSingleton<RestockRepository>(_NoRestock());
  addTearDown(sl.reset);

  final products = FixtureCatalog();
  final reviews = FixtureReviews(photos);
  final auth = stubAuthCubit();
  if (loggedIn) await auth.loadSession();
  final cart = CartCubit(
    FixtureCart(
      cartItems ??
          [
            CartItem(product: fixtureProduct(1)),
            CartItem(product: fixtureProduct(2), quantity: 2),
          ],
    ),
  );
  await cart.load();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<CartCubit>.value(value: cart),
        BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
        BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(reviews)),
        BlocProvider<PointsCubit>(create: (_) => PointsCubit(FixturePoints())),
        BlocProvider<CollectionsCubit>(
          create: (_) => CollectionsCubit(FixtureCollections()),
        ),
        BlocProvider<NotificationsCubit>(
          create: (_) => NotificationsCubit(FixtureNotifications()),
        ),
        BlocProvider<ThemeCubit>(create: (_) => ThemeCubit(prefs)),
        BlocProvider<LocaleCubit>(create: (_) => LocaleCubit(prefs)),
      ],
      child: MultiRepositoryProvider(
        providers: [
          RepositoryProvider.value(value: FetchHomeUsecase(products)),
          RepositoryProvider.value(value: FetchCategoriesUsecase(products)),
          RepositoryProvider.value(
            value: FetchCategoryProductsUsecase(products),
          ),
          RepositoryProvider.value(value: FetchProductsUsecase(products)),
          RepositoryProvider.value(value: FetchProductDetailsUsecase(products)),
          RepositoryProvider.value(value: SearchProductsUsecase(products)),
          RepositoryProvider.value(value: FetchMyOrdersUsecase(orders)),
          RepositoryProvider.value(value: FetchOrderDetailsUsecase(orders)),
          RepositoryProvider.value(value: FetchCheckoutQuoteUsecase(orders)),
          RepositoryProvider.value(value: PlaceOrderUsecase(orders)),
          RepositoryProvider.value(
            value: FetchGovernoratesUsecase(FixtureGovernorates()),
          ),
          RepositoryProvider<ReviewRepository>.value(value: reviews),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: _delegates,
          builder: _scope(language, textScale),
          home: home,
        ),
      ),
    ),
  );
  await settleFixture(tester);
}

/// الغلاف الرئيسي على التبويب [tab].
Future<void> pumpFixtureShell(
  WidgetTester tester, {
  required int tab,
  required AppLanguage language,
  required double textScale,
  bool loggedIn = true,
}) async {
  mainNavIndex.value = MainTab.home;
  await pumpFixtureApp(
    tester,
    home: const MainNavigationScreen(),
    language: language,
    textScale: textScale,
    loggedIn: loggedIn,
    photos: [for (var i = 0; i < 4; i++) fixturePhoto(i)],
  );
  // الغلاف يستمع لتغيّر المؤشّر بعد تركيبه، لا لقيمته قبل ذلك.
  mainNavIndex.value = tab;
  await settleFixture(tester);
}

class _AuthRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/home',
      page: PageInfo(
        'HomePlaceholderRoute',
        builder: (_) => const Scaffold(body: SizedBox.shrink()),
      ),
    ),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
  ];
  @override
  RouteType get defaultRouteType => const RouteType.material();
}

/// شاشة مصادقة مدفوعة فوق شاشةٍ محايدة — كما في التطبيق.
Future<void> pumpFixtureAuth(
  WidgetTester tester, {
  required PageRouteInfo route,
  required AppLanguage language,
  required double textScale,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs);
  final auth = stubAuthCubit();
  addTearDown(locale.close);
  addTearDown(auth.close);
  final sl = GetIt.I;
  sl.registerSingleton<AppConfig>(AppConfig.development);
  sl.registerSingleton<PersonalizeStorage>(PersonalizeStorage(prefs));
  sl.registerSingleton<PointsRepository>(FixturePoints());
  addTearDown(sl.reset);
  final router = _AuthRouter();
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<LocaleCubit>.value(value: locale),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: _delegates,
        builder: _scope(language, textScale),
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();
  unawaited(router.push(route));
  await settleFixture(tester);
}

/// يترك الطلبات الوهمية تكتمل والصور تُفكّ — الرسوم بعرضٍ وارتفاعٍ صفر حتى
/// تُفكّ، والقياس قبلها يقارن صورةً مفكوكة بأخرى لم تُفكّ.
Future<void> settleFixture(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  for (var i = 0; i < 3; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 150)),
    );
    await tester.pump(const Duration(milliseconds: 300));
  }
}

/// يفتح ورقةً أو حواراً بعد أول إطار — لقياس الأوراق كالشاشات.
class FixtureSheetHost extends StatefulWidget {
  const FixtureSheetHost({super.key, required this.open});

  final void Function(BuildContext context) open;

  @override
  State<FixtureSheetHost> createState() => _FixtureSheetHostState();
}

class _FixtureSheetHostState extends State<FixtureSheetHost> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.open(context);
    });
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox.expand());
}
