// آخر عنصرٍ في كل شاشة يُمرَّر فوق كل ما يغطّي أسفلها.
//
// [CRITICAL] العطب (Staging، 2026-10): زرّ «تسجيل الخروج» في الحساب نصفه
// تحت شريط التنقّل على بعض الهواتف. السبب ليس الزرّ: كل مُمرِّر في التطبيق
// كان يكتب حشوته السفلية رقماً ثابتاً — ١٠٤ تحت الشريط العائم (منسوخة من
// المرجع الذي لا إزاحة نظامٍ في إطاره)، و٢٦ في الشاشات المدفوعة — بينما
// المساحة المغطّاة فعلاً تتغيّر مع الجهاز: إزاحة الإيماءات (~٢٤)، والأزرار
// الثلاثة (~٤٨)، وتكبير الخط الذي يرفع الشريط نفسه. مقيساً قبل الإصلاح على
// ٣٩٠×٨٤٤: الزرّ مخفيّ ٢٢٫٥ بكسل بالإيماءات و٤٦٫٥ بالأزرار الثلاثة.
//
// لذلك يقيس هذا الملف **النتيجة** لا الحشوة، بمعيارين لكل شاشة:
// - **مرئيّ وقابل للنقر**: بعد التمرير إلى النهاية يقع آخر عنصر تفاعلي
//   كاملاً فوق سطح الشريط والزرّ المرفوع (أو فوق شريط النظام)، ونقرةٌ عند
//   حافته السفلى تصيبه هو لا الشريط.
// - **المسافة نفسها على كل جهاز**: الفجوة بين آخر عنصر وما يغطّي الشاشة لا
//   تتغيّر بتغيّر الإزاحة — فلا قصّ، ولا إزاحةٌ مضاعفة تترك فراغاً زائداً.
//
// الإزاحات تُبدَّل داخل الاختبار الواحد على الشجرة نفسها (٠ ثم ٢٤ ثم ٤٨)،
// كما يحدث حين يبدّل المستخدم نمط التنقّل من إعدادات النظام.

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
import 'package:otaku_galaxy/features/account/presentation/screens/account_screen.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/widgets/auth_scaffold.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/cart/presentation/screens/cart_screen.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/categories_screen.dart';
import 'package:otaku_galaxy/features/collections/domain/repositories/collection_repository.dart';
import 'package:otaku_galaxy/features/collections/presentation/cubit/collections_cubit.dart';
import 'package:otaku_galaxy/features/community/presentation/screens/community_screen.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/home/presentation/screens/home_screen.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/product_card.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/orders_screen.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_products_usecase.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

// ── الأجهزة ─────────────────────────────────────────────────────────────

/// مقاسات منطقية: هاتف صغير قصير، هاتف عادي، هاتف طويل.
const _small = Size(360, 640);
const _normal = Size(390, 844);
const _tall = Size(412, 915);

/// إزاحات النظام السفلية: بلا شريط، مؤشّر الإيماءات، الأزرار الثلاثة.
const _insets = [0.0, 24.0, 48.0];

/// شريط الحالة أعلى الشاشة — ثابت في كل الحالات.
const _statusBar = 24.0;

String _label(Size size) => '${size.width.toInt()}×${size.height.toInt()}';

void _useDevice(WidgetTester tester, Size size, {double textScale = 1}) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  _setInsets(tester, bottom: 0);
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

/// يبدّل إزاحة النظام السفلية — و[keyboard] لوحة مفاتيح مفتوحة فوقها.
///
/// مع لوحة المفاتيح يبقى الشريط في `viewPadding` ويُصفَّر من `padding`،
/// كما يُبلغه أندرويد فعلاً (اللوحة تغطّي شريط النظام).
void _setInsets(
  WidgetTester tester, {
  required double bottom,
  double keyboard = 0,
}) {
  tester.view.padding = FakeViewPadding(
    top: _statusBar,
    bottom: keyboard > 0 ? 0 : bottom,
  );
  tester.view.viewPadding = FakeViewPadding(top: _statusBar, bottom: bottom);
  tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
}

// ── القياس ──────────────────────────────────────────────────────────────

/// أعلى سطح شريط التنقّل المرسوم (لا صندوق تخطيطه بحشوته الشفافة).
double _navSurfaceTop(WidgetTester tester) {
  final row = find
      .descendant(of: find.byType(OtakuBottomNav), matching: find.byType(Row))
      .first;
  return tester
      .getRect(find.ancestor(of: row, matching: find.byType(Container)).first)
      .top;
}

/// أعلى نقطةٍ مرسومة من الشريط: سطحه أو زرّ المجتمع المرفوع، أيّهما أعلى.
double _navTop(WidgetTester tester) {
  final raised = tester.getRect(find.byKey(const Key('nav_shape_community')));
  final surface = _navSurfaceTop(tester);
  return raised.top < surface ? raised.top : surface;
}

/// يمرّر كل مُمرِّرٍ رأسيّ تحت [screen] إلى نهايته — مرّتين، لأن الوصول إلى
/// النهاية قد يجلب صفحةً أخرى (الرئيسية) فتتغيّر النهاية نفسها.
Future<void> _scrollToEnd(WidgetTester tester, Finder screen) async {
  for (var pass = 0; pass < 2; pass++) {
    final scrollables = find.descendant(
      of: screen,
      matching: find.byType(Scrollable),
    );
    for (final element in scrollables.evaluate()) {
      final state = (element as StatefulElement).state as ScrollableState;
      if (state.position.axis != Axis.vertical) continue;
      state.position.jumpTo(state.position.maxScrollExtent);
    }
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// العنصر الأدنى على الشاشة بين مطابقات [finder].
Finder _lowest(WidgetTester tester, Finder finder) {
  final count = finder.evaluate().length;
  expect(count, greaterThan(0), reason: 'لا عنصر يطابق $finder');
  var best = 0;
  var bestBottom = double.negativeInfinity;
  for (var i = 0; i < count; i++) {
    final bottom = tester.getRect(finder.at(i)).bottom;
    if (bottom > bestBottom) {
      bestBottom = bottom;
      best = i;
    }
  }
  return finder.at(best);
}

/// [CRITICAL] المعيار: العنصر كاملاً فوق [coveredFrom]، ونقرةٌ عند وسطه
/// وعند حافته السفلى تصيبه هو. تُعيد الفجوة بينه وبين [gapFrom].
double _expectReachable(
  WidgetTester tester,
  Finder target, {
  required double coveredFrom,
  required double gapFrom,
  required String reason,
}) {
  expect(target, findsOneWidget, reason: reason);
  final rect = tester.getRect(target);
  expect(
    rect.bottom,
    lessThanOrEqualTo(coveredFrom + 0.01),
    reason:
        '$reason — أسفل العنصر ${rect.bottom.toStringAsFixed(1)} '
        'تحت بداية المنطقة المغطّاة ${coveredFrom.toStringAsFixed(1)}',
  );
  expect(rect.top, greaterThanOrEqualTo(0), reason: '$reason — خرج من الأعلى');

  final box = tester.renderObject(target);
  for (final point in [rect.center, Offset(rect.center.dx, rect.bottom - 1)]) {
    final hits = tester.hitTestOnBinding(point).path.map((e) => e.target);
    expect(
      hits.contains(box),
      isTrue,
      reason: '$reason — النقر عند $point لا يصيب العنصر (شيءٌ فوقه)',
    );
  }
  return gapFrom - rect.bottom;
}

/// الفجوة لا تتغيّر بتغيّر الإزاحة: لا قصّ ولا حشوة مضاعفة.
void _expectSameGap(Map<double, double> gaps, String reason) {
  final values = gaps.values;
  final spread =
      values.reduce((a, b) => a > b ? a : b) -
      values.reduce((a, b) => a < b ? a : b);
  expect(
    spread,
    lessThan(0.5),
    reason: '$reason — الفجوة تتغيّر مع الإزاحة: $gaps',
  );
}

// ── بيانات وهمية ─────────────────────────────────────────────────────────

Product _product(int i) => Product(
  id: 'p$i',
  nameAr: 'منتج $i',
  price: 5000 + i * 250,
  images: const [],
  stock: 9,
);

List<Category> _categories(int n) => [
  for (var i = 0; i < n; i++) Category(id: 'c$i', name: 'قسم $i'),
];

Review _photo(int i) => Review(
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

Order _order(int i) => Order(
  id: 'o$i',
  number: '${1000 + i}',
  province: 'بغداد',
  deliveryCost: 5000,
  fullAddress: 'الكرادة',
  phone: '07701234567',
  total: 30000,
  status: OrderStatus.pending,
  createdAt: DateTime(2026, 9, 1),
);

class _Catalog implements ProductRepository {
  _Catalog({
    this.categories = const [],
    this.home,
    this.categoriesFail = false,
    this.detail,
  });

  final List<Category> categories;

  /// `null` = الطلب لا يكتمل (حالة تحميل دائمة).
  final HomeData? home;
  final bool categoriesFail;
  final Product? detail;

  @override
  Future<List<Category>> fetchCategories() async {
    if (categoriesFail) throw Exception('offline');
    return categories;
  }

  @override
  Future<HomeData> fetchHome() =>
      home == null ? Completer<HomeData>().future : Future.value(home);

  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => const ProductPage(items: [], hasMore: false);

  @override
  Future<Product> fetchProductDetails(String id) async => detail!;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Cart implements CartRepository {
  _Cart(this.items);

  final List<CartItem> items;

  @override
  Future<List<CartItem>> fetchCart() async => items;
  @override
  Future<CartSnapshot> syncCart() async => CartSnapshot(items: items);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Reviews implements ReviewRepository {
  _Reviews([this.photos = const []]);

  final List<Review> photos;

  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async =>
      photos;
  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async =>
      const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _Orders implements OrderRepository {
  _Orders([this.orders = const []]);

  final List<Order> orders;

  @override
  Future<Order?> fetchPendingConfirmation() async => null;
  @override
  Future<List<Order>> fetchMyOrders() async => orders;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
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
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingPoints implements PointsRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingCollections implements CollectionRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingNotifications implements NotificationRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

void _registerServices() {
  GetIt.I.registerSingleton<OrderRepository>(_Orders());
  GetIt.I.registerSingleton<BirthdayStorage>(_NoBirthday());
  GetIt.I.registerSingleton<StoreSettingsRepository>(_NoSettings());
  GetIt.I.registerSingleton<AppConfig>(AppConfig.development);
  GetIt.I.registerSingleton<PointsRepository>(_PendingPoints());
  addTearDown(GetIt.I.reset);
}

const _delegates = [
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

Widget _scope(BuildContext context, Widget? child) => LocaleScope(
  language: AppLanguage.arabic,
  child: child ?? const SizedBox.shrink(),
);

Widget _app({required Widget home}) => MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: _delegates,
  builder: _scope,
  home: home,
);

// ── الغلاف الرئيسي ───────────────────────────────────────────────────────

/// الغلاف الحقيقي على التبويب [tab]، ببياناتٍ تملأ الشاشة المقيسة.
Future<void> _pumpShell(
  WidgetTester tester, {
  required int tab,
  bool loggedIn = true,
  _Catalog? catalog,
  List<CartItem> cartItems = const [],
  List<Review> photos = const [],
}) async {
  _registerServices();
  final products = catalog ?? _Catalog();
  final reviews = _Reviews(photos);
  final auth = stubAuthCubit();
  if (loggedIn) await auth.loadSession();
  final cart = CartCubit(_Cart(cartItems));
  await cart.load();

  mainNavIndex.value = MainTab.home;
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<CartCubit>.value(value: cart),
        BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
        BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(reviews)),
        BlocProvider<PointsCubit>(create: (_) => PointsCubit(_PendingPoints())),
        BlocProvider<CollectionsCubit>(
          create: (_) => CollectionsCubit(_PendingCollections()),
        ),
        BlocProvider<NotificationsCubit>(
          create: (_) => NotificationsCubit(_PendingNotifications()),
        ),
      ],
      child: MultiRepositoryProvider(
        providers: [
          RepositoryProvider.value(value: FetchHomeUsecase(products)),
          RepositoryProvider.value(value: FetchCategoriesUsecase(products)),
          RepositoryProvider.value(value: FetchProductsUsecase(products)),
          RepositoryProvider<ReviewRepository>.value(value: reviews),
        ],
        child: _app(home: const MainNavigationScreen()),
      ),
    ),
  );
  await tester.pump();
  // الغلاف يستمع لتغيّر المؤشّر بعد تركيبه، لا لقيمته قبل ذلك.
  mainNavIndex.value = tab;
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

/// يقيس [target] تحت الشريط العائم لكل إزاحة، على الشجرة نفسها.
///
/// [centered] للحالات الموسَّطة (فارغة/زائر/خطأ): حين تتّسع لها الشاشة
/// تتبع الفجوةُ التوسيطَ لا الحشوة، فيكفي أن يُبلَغ العنصر مكشوفاً — وحين
/// لا تتّسع (هاتف قصير، خط كبير) يجب أن يُمرَّر إليه، وهو ما يُقاس.
Future<Map<double, double>> _measureTab(
  WidgetTester tester, {
  required Finder screen,
  required Finder target,
  required String reason,
  bool centered = false,
}) async {
  final gaps = <double, double>{};
  for (final inset in _insets) {
    _setInsets(tester, bottom: inset);
    await tester.pump();
    await _scrollToEnd(tester, screen);
    gaps[inset] = _expectReachable(
      tester,
      _lowest(tester, target),
      coveredFrom: _navTop(tester),
      gapFrom: _navSurfaceTop(tester),
      reason: '$reason inset=${inset.toInt()}',
    );
  }
  if (!centered) _expectSameGap(gaps, reason);
  return gaps;
}

Finder _private(String type) =>
    find.byWidgetPredicate((w) => w.runtimeType.toString() == type);

// ── الشاشات المدفوعة ─────────────────────────────────────────────────────

/// يقيس [target] في شاشةٍ مدفوعة (بلا شريط تطبيق): المغطّى هو شريط النظام،
/// أو لوحة المفاتيح حين تُفتح.
Future<Map<double, double>> _measurePushed(
  WidgetTester tester, {
  required Finder screen,
  required Finder target,
  required String reason,
  double keyboard = 0,
}) async {
  final gaps = <double, double>{};
  final height = tester.view.physicalSize.height;
  for (final inset in _insets) {
    _setInsets(tester, bottom: inset, keyboard: keyboard);
    await tester.pump();
    await _scrollToEnd(tester, screen);
    final covered = height - (keyboard > 0 ? keyboard : inset);
    gaps[inset] = _expectReachable(
      tester,
      _lowest(tester, target),
      coveredFrom: covered,
      gapFrom: covered,
      reason: '$reason inset=${inset.toInt()} keyboard=${keyboard.toInt()}',
    );
  }
  _expectSameGap(gaps, reason);
  return gaps;
}

/// رواترٌ يدفع شاشة الدخول فوق شاشةٍ محايدة — كما في التطبيق.
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
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

void main() {
  // بالخط البديل تُقاس النصوص العربية بعرضٍ لا علاقة له بالجهاز.
  setUpAll(loadProjectFonts);

  group('العقد: ما يغطّي أسفل الجسم يصل من MediaQuery لا من رقم', () {
    late double overlap;
    final probe = Builder(
      builder: (context) {
        overlap = context.bottomOverlap;
        return const SizedBox.expand();
      },
    );

    testWidgets('شاشة مدفوعة: إزاحة النظام نفسها', (tester) async {
      _useDevice(tester, _normal);
      for (final inset in _insets) {
        _setInsets(tester, bottom: inset);
        await tester.pumpWidget(_app(home: Scaffold(body: probe)));
        expect(overlap, inset);
      }
    });

    testWidgets('تحت الغلاف: ارتفاع الشريط العائم كاملاً', (tester) async {
      _useDevice(tester, _normal);
      final nav = OtakuBottomNav(
        currentIndex: 0,
        raisedIndex: 2,
        onSelected: (_) {},
        items: const [
          OtakuNavItem(icon: Icons.home, activeIcon: Icons.home, label: 'أ'),
          OtakuNavItem(icon: Icons.home, activeIcon: Icons.home, label: 'ب'),
          OtakuNavItem(icon: Icons.home, activeIcon: Icons.home, label: 'ج'),
          OtakuNavItem(icon: Icons.home, activeIcon: Icons.home, label: 'د'),
          OtakuNavItem(icon: Icons.home, activeIcon: Icons.home, label: 'هـ'),
        ],
      );
      for (final inset in _insets) {
        _setInsets(tester, bottom: inset);
        await tester.pumpWidget(
          _app(
            home: Scaffold(
              extendBody: true,
              body: probe,
              bottomNavigationBar: nav,
            ),
          ),
        );
        expect(overlap, tester.getSize(find.byType(OtakuBottomNav)).height);
        // الشريط نفسه يحمل الإزاحة: ما يصل الجسم يكبر بها تماماً.
        expect(overlap - inset, closeTo(92, 0.5), reason: 'inset=$inset');
      }
    });

    testWidgets('تحت SafeArea سفلية: صفر — لا إزاحة مضاعفة', (tester) async {
      _useDevice(tester, _normal);
      _setInsets(tester, bottom: 48);
      await tester.pumpWidget(
        _app(
          home: Scaffold(body: SafeArea(child: probe)),
        ),
      );
      expect(overlap, 0);
    });

    testWidgets('لوحة المفاتيح مفتوحة: صفر — هي ما يغطّي الشريط', (
      tester,
    ) async {
      _useDevice(tester, _normal);
      _setInsets(tester, bottom: 48, keyboard: 300);
      await tester.pumpWidget(_app(home: Scaffold(body: probe)));
      expect(overlap, 0);
    });

    testWidgets('scrollPadding تُبقي حشوة التصميم وتضيف ما يغطّي', (
      tester,
    ) async {
      _useDevice(tester, _normal);
      _setInsets(tester, bottom: 48);
      late EdgeInsets padding;
      await tester.pumpWidget(
        _app(
          home: Scaffold(
            body: Builder(
              builder: (context) {
                padding = context.scrollPadding(
                  const EdgeInsets.fromLTRB(18, 8, 18, 26),
                );
                return const SizedBox.expand();
              },
            ),
          ),
        ),
      );
      expect(padding, const EdgeInsets.fromLTRB(18, 8, 18, 74));
    });
  });

  group('[CRITICAL] تبويب الحساب: «تسجيل الخروج» فوق الشريط العائم', () {
    for (final textScale in const [1.0, 1.3]) {
      for (final size in const [_small, _normal, _tall]) {
        testWidgets('${_label(size)} خط×$textScale', (tester) async {
          _useDevice(tester, size, textScale: textScale);
          await _pumpShell(tester, tab: MainTab.account);

          final gaps = await _measureTab(
            tester,
            screen: find.byType(AccountScreen),
            target: _private('_LogoutButton'),
            reason: 'الحساب ${_label(size)} خط×$textScale',
          );
          // مسافة المرجع نفسها فوق سطح الشريط (١٠٤ − ٩٢ على هاتفٍ بلا إزاحة).
          expect(gaps[0]!, closeTo(OtakuBottomNav.contentGap, 0.5));
        });
      }
    }
  });

  group('[CRITICAL] بقية التبويبات: آخر عنصر فوق الشريط العائم', () {
    const cases = [(_small, 1.0), (_normal, 1.0), (_tall, 1.0), (_small, 1.3)];
    for (final (size, textScale) in cases) {
      final tag = '${_label(size)} خط×$textScale';

      testWidgets('الأقسام: آخر بطاقة — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(
          tester,
          tab: MainTab.categories,
          catalog: _Catalog(categories: _categories(12)),
        );
        final gaps = await _measureTab(
          tester,
          screen: find.byType(CategoriesScreen),
          target: find.byType(AnimeCategoryCard),
          reason: 'الأقسام $tag',
        );
        expect(gaps[0]!, closeTo(OtakuBottomNav.contentGap, 0.5));
      });

      testWidgets('الأقسام: «إعادة المحاولة» بعد فشل — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(
          tester,
          tab: MainTab.categories,
          catalog: _Catalog(categoriesFail: true),
        );
        await _measureTab(
          tester,
          screen: find.byType(CategoriesScreen),
          target: find.descendant(
            of: find.byType(AnimeErrorState),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'خطأ الأقسام $tag',
          centered: true,
        );
      });

      testWidgets('الرئيسية: آخر منتج في «اكتشف» — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(
          tester,
          tab: MainTab.home,
          catalog: _Catalog(
            home: HomeData(discover: [for (var i = 0; i < 9; i++) _product(i)]),
          ),
        );
        await _measureTab(
          tester,
          screen: find.byType(HomeScreen),
          target: find.byType(ProductCard),
          reason: 'الرئيسية $tag',
        );
      });

      testWidgets('السلة: زرّ الإتمام — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(
          tester,
          tab: MainTab.cart,
          cartItems: [
            for (var i = 0; i < 5; i++)
              CartItem(product: _product(i), lineId: 'l$i'),
          ],
        );
        await _measureTab(
          tester,
          screen: find.byType(CartScreen),
          target: find.descendant(
            of: find.byType(CartScreen),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'السلة $tag',
        );
      });

      testWidgets('السلة الفارغة: «اكتشف» — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(tester, tab: MainTab.cart);
        await _measureTab(
          tester,
          screen: find.byType(CartScreen),
          target: find.descendant(
            of: find.byType(AnimeEmptyState),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'السلة الفارغة $tag',
          centered: true,
        );
      });

      testWidgets('السلة للزائر: «تسجيل الدخول» — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(tester, tab: MainTab.cart, loggedIn: false);
        await _measureTab(
          tester,
          screen: find.byType(CartScreen),
          target: find.descendant(
            of: find.byType(AnimeGuestPrompt),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'السلة للزائر $tag',
          centered: true,
        );
      });

      testWidgets('المجتمع: آخر صورة في المعرض — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(
          tester,
          tab: MainTab.community,
          photos: [for (var i = 0; i < 9; i++) _photo(i)],
        );
        final gaps = await _measureTab(
          tester,
          screen: find.byType(CommunityScreen),
          target: _private('_PhotoTile'),
          reason: 'المجتمع $tag',
        );
        // البلاطة الأدنى آخر ما في عمودها: بعدها فاصل ١٢ ثم مسافة الشريط.
        expect(gaps[0]!, closeTo(12 + OtakuBottomNav.contentGap, 0.5));
      });

      testWidgets('المجتمع الفارغ: «شارك تجربتك» — $tag', (tester) async {
        _useDevice(tester, size, textScale: textScale);
        await _pumpShell(tester, tab: MainTab.community);
        await _measureTab(
          tester,
          screen: find.byType(CommunityScreen),
          target: find.descendant(
            of: find.byType(AnimeEmptyState),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'المجتمع الفارغ $tag',
          centered: true,
        );
      });
    }
  });

  group('[CRITICAL] الشاشات المدفوعة: آخر عنصر فوق شريط النظام', () {
    for (final size in const [_small, _tall]) {
      final tag = _label(size);

      testWidgets('طلباتي: آخر طلب — $tag', (tester) async {
        _useDevice(tester, size);
        _registerServices();
        await tester.pumpWidget(
          RepositoryProvider.value(
            value: FetchMyOrdersUsecase(
              _Orders([for (var i = 0; i < 8; i++) _order(i)]),
            ),
            child: BlocProvider<AuthCubit>.value(
              value: stubAuthCubit(),
              child: _app(home: const OrdersScreen()),
            ),
          ),
        );
        await tester.pump();
        final gaps = await _measurePushed(
          tester,
          screen: find.byType(OrdersScreen),
          target: find.byType(AnimeOrderCard),
          reason: 'طلباتي $tag',
        );
        expect(gaps[0]!, closeTo(26, 0.5), reason: 'حشوة التصميم كما هي');
      });

      for (final keyboard in const [0.0, 300.0]) {
        testWidgets('الدخول: رابط الذيل — $tag لوحة=${keyboard.toInt()}', (
          tester,
        ) async {
          _useDevice(tester, size);
          _registerServices();
          final router = _AuthRouter();
          await tester.pumpWidget(
            BlocProvider<AuthCubit>.value(
              value: stubAuthCubit(),
              child: MaterialApp.router(
                theme: AppTheme.light,
                locale: const Locale('ar'),
                supportedLocales: const [Locale('ar')],
                localizationsDelegates: _delegates,
                builder: _scope,
                routerConfig: router.config(),
              ),
            ),
          );
          await tester.pump();
          router.push(const LoginRoute());
          await tester.pump();
          // انتقال الصفحة الافتراضي على أندرويد (`FadeForwards`) ٨٠٠ مللي
          // ثانية؛ القياس أثناءه يقيس حركةً لا تخطيطاً.
          await tester.pump(const Duration(seconds: 1));

          final footer = tester
              .widget<AuthScaffold>(find.byType(AuthScaffold))
              .footer!;
          final gaps = await _measurePushed(
            tester,
            screen: find.byType(AuthScaffold),
            target: find.byWidget(footer),
            reason: 'الدخول $tag',
            keyboard: keyboard,
          );
          // مسافة التصميم (٢٦) فوق شريط النظام أو فوق اللوحة — لا خلفهما ولا
          // مضاعفة (اللوحة تصفّر إزاحة الشريط بدل أن تُضاف إليها).
          expect(gaps[0]!, closeTo(26, 0.5));
        });
      }

      testWidgets('تفاصيل المنتج: الشريط المثبّت بلا إزاحة مضاعفة — $tag', (
        tester,
      ) async {
        _useDevice(tester, size);
        _registerServices();
        final product = _product(1);
        await tester.pumpWidget(
          MultiRepositoryProvider(
            providers: [
              RepositoryProvider.value(
                value: FetchProductDetailsUsecase(_Catalog(detail: product)),
              ),
              RepositoryProvider<ReviewRepository>.value(value: _Reviews()),
            ],
            child: MultiBlocProvider(
              providers: [
                BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
                BlocProvider<AuthCubit>.value(value: stubAuthCubit()),
                BlocProvider<CartCubit>(
                  create: (_) => CartCubit(_Cart(const [])),
                ),
              ],
              child: _app(home: ProductDetailScreen(productId: product.id)),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));

        // الشريط خارج المُمرِّر وتحمل `SafeArea` إزاحته: ١٤ حشوته فوق شريط
        // النظام بالضبط، لا ١٤ + الإزاحة مرّتين.
        final gaps = await _measurePushed(
          tester,
          screen: find.byType(ProductDetailScreen),
          target: find.descendant(
            of: find.byType(ProductDetailScreen),
            matching: find.byType(AnimePrimaryButton),
          ),
          reason: 'تفاصيل المنتج $tag',
        );
        expect(gaps[0]!, closeTo(14, 0.5));
      });
    }
  });
}
