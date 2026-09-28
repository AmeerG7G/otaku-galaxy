// مواضع رسوم الشخصيات على الشاشات الحقيقية — تعديلات المالك (2026-09-28).
//
// كل اختبارٍ هنا يبني الشاشة الفعلية (لا نسخةً من جسمها) على هاتفٍ بشريط
// حالةٍ حقيقي (٢٤ بكسل أعلى الشاشة) ويقيس المستطيلات: موضع الرسم نسبةً إلى
// حوافّ الشاشة والترويسة والفاصل والأزرار. الأرقام والاستبدالات والحذف على
// مستوى الأصول في `character_art_test.dart`؛ هنا الهندسة.

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/categories_screen.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/orders_screen.dart';
import 'package:otaku_galaxy/features/orders/presentation/widgets/delivery_confirmation_sheet.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/rate_order_screen.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/write_review_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/personalize_screen.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

/// ارتفاع شريط الحالة المحاكى — أيقونات البطارية والشبكة.
const double _statusBar = 24;
const Size _phoneSize = Size(412, 892);

void _phone(WidgetTester tester) {
  tester.view.physicalSize = _phoneSize;
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = const FakeViewPadding(top: _statusBar);
  tester.view.viewPadding = const FakeViewPadding(top: _statusBar);
  addTearDown(tester.view.reset);
}

Finder _art(String slot) =>
    find.byWidgetPredicate((w) => w is CharacterArtwork && w.slot == slot);

/// عرض وارتفاع PNG من ترويسته (IHDR) — بلا فكّ الصورة.
Size _pngSize(String path) {
  final bytes = File(path).readAsBytesSync();
  final data = ByteData.sublistView(bytes);
  return Size(data.getUint32(16).toDouble(), data.getUint32(20).toDouble());
}

/// أوّل عمودٍ من اليسار فيه بكسلٌ غير شفّاف — حيث تبدأ الشخصية فعلاً.
Future<int> _firstOpaqueColumn(WidgetTester tester, String path) async {
  late int first;
  await tester.runAsync(() async {
    final codec = await ui.instantiateImageCodec(File(path).readAsBytesSync());
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    first = image.width;
    for (var y = 0; y < image.height; y++) {
      for (var x = 0; x < first; x++) {
        if (data.getUint8((y * image.width + x) * 4 + 3) > 0) {
          first = x;
          break;
        }
      }
    }
    image.dispose();
    codec.dispose();
  });
  return first;
}

/// يفكّ صورة الموضع ثم يعيد الرسم — رسمٌ بعرضٍ وحده ارتفاعه صفر حتى تُفكّ.
Future<void> _decode(WidgetTester tester, String slot) async {
  await tester.runAsync(() async {
    await precacheImage(AssetImage(CharacterArt.forSlot(slot)!), tester.element(_art(slot)));
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });
  await tester.pump();
}

Widget _app({
  required Widget home,
  List<RepositoryProvider<Object?>> repos = const [],
  List<BlocProvider<StateStreamableSource<Object?>>> blocs = const [],
}) {
  final app = MaterialApp(
    theme: AppTheme.light,
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => LocaleScope(
      language: AppLanguage.arabic,
      child: child ?? const SizedBox.shrink(),
    ),
    home: home,
  );
  final withBlocs = blocs.isEmpty ? app : MultiBlocProvider(providers: blocs, child: app);
  return repos.isEmpty ? withBlocs : MultiRepositoryProvider(providers: repos, child: withBlocs);
}

// ── بدائل المستودعات: ما تحتاجه الشاشة وحده، والباقي خطأٌ صريح ──

class _Orders implements OrderRepository {
  @override
  Future<List<Order>> fetchMyOrders() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('$invocation');
}

class _Reviews implements ReviewRepository {
  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  Future<Review?> findReview({required String orderId, required String productId}) async => null;
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('$invocation');
}

class _Products implements ProductRepository {
  @override
  Future<List<Category>> fetchCategories() async => const [
    Category(id: 'c1', name: 'مانغا'),
    Category(id: 'c2', name: 'مجسمات'),
  ];
  @override
  Future<Product> fetchProductDetails(String id) async => _product;
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('$invocation');
}

const _product = Product(
  id: 'p1',
  nameAr: 'حقيبة ناروتو',
  descriptionAr: 'حقيبة مدرسية',
  price: 25000,
  images: [],
  stock: 5,
  categoryId: 'c1',
);

Order _order(OrderStatus status) => Order(
  id: 'o1',
  number: '1001',
  province: 'بغداد',
  deliveryCost: 5000,
  fullAddress: 'الكرادة',
  phone: '+9647701234567',
  total: 30000,
  status: status,
  items: const [CartItem(product: _product)],
  canReview: true,
  reviewableProductCount: 1,
);

class _AuthRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/home',
      page: PageInfo('HomePlaceholderRoute', builder: (_) => const Scaffold(body: SizedBox.shrink())),
    ),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
  ];
  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<void> _pumpAuth(WidgetTester tester, PageRouteInfo route) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs);
  final auth = stubAuthCubit();
  addTearDown(locale.close);
  addTearDown(auth.close);
  _phone(tester);
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
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();
  router.push(route);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 900));
}

void main() {
  setUpAll(() async {
    // الخطوط الحقيقية: بالخطّ البديل تُقاس نصوص الرأس بعرضٍ وارتفاعٍ لا
    // علاقة لهما بالجهاز (انظر `support/render_harness.dart`).
    await loadProjectFonts();
    if (!sl.isRegistered<AppConfig>()) sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
  });

  group('image 1 — login header', () {
    testWidgets('moved slightly down: the bust now sits on the header bottom edge; box and x unchanged', (tester) async {
      await _pumpAuth(tester, const LoginRoute());
      final art = _art(VisualSlots.login);
      expect(art, findsOneWidget);
      final box = tester.getRect(art);
      final header = tester.getRect(find.ancestor(of: art, matching: find.byType(ClipRRect)).first);

      // الصندوق والموضع الأفقي كما كانا: ١٣٨×١٩٦، وجهة النهاية -٣٤.
      expect(box.size, const Size(138, 196));
      expect(box.left, closeTo(header.left - 34, 0.01));

      // الصندوق تحت حافة الرأس بـ٢٩ (كان ١٨) — أي أنزل بـ١١.
      expect(box.bottom - header.bottom, closeTo(29, 0.01));

      // الصورة `contain` موسَّطة في الصندوق: قاعُها المرسوم على حافة الرأس
      // تماماً (كان يطفو ١١ فوقها).
      final image = _pngSize(CharacterArt.forSlot(VisualSlots.login)!);
      final scale = [box.width / image.width, box.height / image.height].reduce((a, b) => a < b ? a : b);
      final paintedHeight = image.height * scale;
      final paintedBottom = box.center.dy + paintedHeight / 2;
      final paintedTop = box.center.dy - paintedHeight / 2;
      expect(paintedBottom, closeTo(header.bottom, 0.5));
      // والنزول يُبعد الرأس عن شريط الحالة لا يقرّبه.
      expect(paintedTop, greaterThan(_statusBar));
      expect(tester.takeException(), isNull);
    });
  });

  group('characters beside buttons are gone (item 2)', () {
    for (final (name, route, header) in [
      ('login', const LoginRoute() as PageRouteInfo, VisualSlots.login),
      ('register', const RegisterRoute() as PageRouteInfo, VisualSlots.registerHeader),
      ('forgot password', const ForgotPasswordRoute() as PageRouteInfo, VisualSlots.forgotPasswordHeader),
    ]) {
      testWidgets('$name: only the header character — none on the form card beside the button', (tester) async {
        await _pumpAuth(tester, route);
        expect(find.byType(CharacterArtwork), findsOneWidget);
        expect(_art(header), findsOneWidget);
      });
    }

    testWidgets('guest prompt (cart & favorites): no character behind the login button', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          home: Scaffold(
            body: AnimeGuestPrompt(title: 'زائر', body: 'سجّل الدخول', onLogin: () {}),
          ),
        ),
      );
      expect(find.byType(AnimePrimaryButton), findsOneWidget);
      expect(find.byType(CharacterArtwork), findsNothing);
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('EXCEPTION kept: the character above-left of «أضف للسلة»', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          repos: [
            RepositoryProvider<FetchProductDetailsUsecase>.value(value: FetchProductDetailsUsecase(_Products())),
            RepositoryProvider<ReviewRepository>.value(value: _Reviews()),
          ],
          blocs: [
            BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
            BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
          ],
          home: const ProductDetailScreen(productId: 'p1'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await _decode(tester, VisualSlots.productDetailReviews);
      final button = tester.getRect(find.byType(AnimePrimaryButton).last);
      final art = tester.getRect(_art(VisualSlots.productDetailReviews));
      expect(art.height, greaterThan(0));
      // يعلو الزرّ (يطلّ على حافته العليا) على جهته اليسرى.
      expect(art.top, lessThan(button.top));
      expect(art.center.dy, lessThan(button.top));
      expect(art.center.dx, lessThan(button.center.dx));
    });
  });

  group('«طلباتي» — 20% smaller, fully inside the left edge', () {
    testWidgets('header character', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          repos: [RepositoryProvider<FetchMyOrdersUsecase>.value(value: FetchMyOrdersUsecase(_Orders()))],
          home: const OrdersScreen(),
        ),
      );
      await tester.pump();
      final art = tester.getRect(_art(VisualSlots.ordersHeader));
      // ٨٠٪ من العرض الافتراضي (١٢٦ ← ١٠٠٫٨).
      expect(OrdersScreen.artScale, 0.8);
      expect(art.width, closeTo(OtakuScreenHeader.defaultArtworkWidth * 0.8, 0.01));
      // لا يدخل من اليسار ولا يُقصّ — ويبقى ملاصقاً للحافة.
      expect(art.left, greaterThanOrEqualTo(0));
      expect(art.left, lessThanOrEqualTo(2));
      expect(art.right, lessThanOrEqualTo(_phoneSize.width));
      // داخل منطقة المحتوى المرئية: تحت شريط الحالة لا تحته.
      expect(art.top, greaterThanOrEqualTo(_statusBar));
      expect(tester.takeException(), isNull);
    });
  });

  group('«قيّم منتجات طلبك» — 15% smaller, clear of the status bar', () {
    testWidgets('header character', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          blocs: [
            BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(_Reviews())),
            BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
          ],
          home: RateOrderScreen(order: _order(OrderStatus.completed)),
        ),
      );
      await tester.pumpAndSettle();
      final art = tester.getRect(_art(VisualSlots.rateOrder));
      expect(RateOrderScreen.artScale, 0.85);
      expect(art.width, closeTo(OtakuScreenHeader.defaultArtworkWidth * 0.85, 0.01));
      // [CRITICAL] كان يبدأ عند -١٤ — تحت أيقونات البطارية والشبكة.
      expect(art.top, greaterThanOrEqualTo(_statusBar));
      expect(art.top, closeTo(_statusBar, 0.01), reason: 'as high as allowed — right under the status bar');
      // الجزء نفسه من الشخصية خلف الحافة اليسرى كما كان (٤٠ من ١٢٦).
      expect(art.left, closeTo(OtakuScreenHeader.defaultArtworkEnd * 0.85, 0.01));
      expect(tester.takeException(), isNull);
    });

    testWidgets('screens that did not opt in keep the default header placement', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          home: const Scaffold(
            body: Column(
              children: [
                OtakuScreenHeader(title: 'عنوان', artworkSlot: VisualSlots.notificationsHeader),
              ],
            ),
          ),
        ),
      );
      final art = tester.getRect(_art(VisualSlots.notificationsHeader));
      expect(art.top, OtakuScreenHeader.defaultArtworkTop);
      expect(art.width, OtakuScreenHeader.defaultArtworkWidth);
    });
  });

  group('«قيّم المنتج» — no character (image 27 removed)', () {
    testWidgets('write-review screen has no character art at all', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          blocs: [
            BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(_Reviews())),
            BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
          ],
          home: const WriteReviewScreen(orderId: 'o1', productId: 'p1', productName: 'حقيبة ناروتو'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(OtakuScreenHeader), findsOneWidget);
      expect(find.byType(CharacterArtwork), findsNothing);
      final assets = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => i.image)
          .whereType<AssetImage>()
          .map((i) => i.assetName)
          .where((a) => a.startsWith('assets/art/'));
      expect(assets, isEmpty);
    });
  });

  group('delivery confirmation — no character (image 22 removed)', () {
    testWidgets('the sheet shows its title and buttons without art', (tester) async {
      _phone(tester);
      late BuildContext ctx;
      await tester.pumpWidget(
        _app(
          blocs: [BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male'))],
          home: Scaffold(
            body: Builder(
              builder: (context) {
                ctx = context;
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      );
      showDeliveryConfirmationSheet(ctx, order: _order(OrderStatus.delivering));
      await tester.pumpAndSettle();
      expect(find.text(AppStrings.arabic('receivedOrderQuestion')), findsOneWidget);
      expect(find.byType(CharacterArtwork), findsNothing);
    });
  });

  group('«لنهيئ تجربتك» — title → divider → character → «اختر لغتك» → controls', () {
    testWidgets('vertical hierarchy, the character touching the divider, nothing under the status bar', (tester) async {
      _phone(tester);
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        _app(
          blocs: [
            BlocProvider<LocaleCubit>(create: (_) => LocaleCubit(prefs)),
            BlocProvider<ThemeCubit>(create: (_) => ThemeCubit(prefs)),
          ],
          home: const PersonalizeScreen(),
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);

      final title = tester.getRect(find.text(AppStrings.arabic('personalizeTitle')));
      final divider = tester.getRect(find.byKey(PersonalizeScreen.dividerKey));
      final art = tester.getRect(_art(VisualSlots.personalize));
      final body = tester.getRect(find.text(AppStrings.arabic('personalizeBody')));
      final language = tester.getRect(find.text(AppStrings.arabic('language')));

      expect(AppStrings.arabic('personalizeBody'), startsWith('اختر لغتك'));
      expect(title.bottom, lessThanOrEqualTo(divider.top));
      // ملاصقٌ للفاصل من تحته، والصورة مثبّتةٌ أعلى صندوقها.
      expect(art.top, closeTo(divider.bottom, 0.01));
      expect(tester.widget<CharacterArtwork>(_art(VisualSlots.personalize)).alignment, Alignment.topCenter);
      expect(body.top, greaterThanOrEqualTo(art.bottom));
      expect(language.top, greaterThan(body.bottom));
      // لا تداخل مع شريط الحالة.
      expect(art.top, greaterThan(_statusBar));
      expect(title.top, greaterThanOrEqualTo(_statusBar));
      // داخل الشاشة أفقياً.
      expect(art.left, greaterThanOrEqualTo(0));
      expect(art.right, lessThanOrEqualTo(_phoneSize.width));
    });
  });

  group('«الأقسام» — status-bar area used by this screen only', () {
    Future<void> pumpCategories(WidgetTester tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          repos: [RepositoryProvider<FetchCategoriesUsecase>.value(value: FetchCategoriesUsecase(_Products()))],
          blocs: [BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male'))],
          home: const Scaffold(body: CategoriesScreen()),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets('header and its character extend into the status-bar region', (tester) async {
      await pumpCategories(tester);
      final header = tester.getRect(find.byType(OtakuScreenHeader));
      final art = tester.getRect(_art(VisualSlots.categoriesHeader));
      expect(header.top, 0);
      expect(art.top, lessThan(_statusBar), reason: 'the art now uses the status-bar area');
      // لا SafeArea بين الشاشة والترويسة.
      expect(
        find.ancestor(of: find.byType(OtakuScreenHeader), matching: find.byType(SafeArea)),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('no important/interactive content is pushed under the status bar or clipped', (tester) async {
      await pumpCategories(tester);
      final header = tester.getRect(find.byType(OtakuScreenHeader));
      final title = tester.getRect(find.text(AppStrings.arabic('navCategories')));
      expect(title.top, greaterThanOrEqualTo(_statusBar));
      // البطاقات تحت الترويسة كاملةً، والجسم لا يضيف هامش شريط الحالة مرّة ثانية.
      final firstCard = tester.getRect(find.byType(AnimeCategoryCard).first);
      expect(firstCard.top, greaterThanOrEqualTo(header.bottom));
      expect(firstCard.top - header.bottom, closeTo(18, 0.01));
      final list = find.descendant(of: find.byType(CategoriesScreen), matching: find.byType(ListView)).first;
      expect(MediaQuery.paddingOf(tester.element(list)).top, 0);
      expect(find.byType(AnimeCategoryCard).first.hitTestable(), findsOneWidget);
    });

    test('scoped: the global system-UI mode is untouched and set in one place only', () {
      final calls = <String>[];
      for (final file in Directory('lib').listSync(recursive: true).whereType<File>()) {
        if (!file.path.endsWith('.dart')) continue;
        if (file.readAsStringSync().contains('setEnabledSystemUIMode(')) calls.add(file.path);
      }
      expect(calls, ['lib/bootstrap.dart']);
      expect(File('lib/bootstrap.dart').readAsStringSync(), contains('setEnabledSystemUIMode(SystemUiMode.edgeToEdge)'));
      // والشاشة نفسها بلا `SafeArea` في كودها — التغيير لها وحدها.
      final code = File('lib/features/categories/presentation/screens/categories_screen.dart')
          .readAsLinesSync()
          .where((l) => !l.trimLeft().startsWith('//'))
          .join('\n');
      expect(code, isNot(contains('SafeArea(')));
    });
  });

  group('image 16 — product detail, closer to the left edge, never crossing it', () {
    testWidgets('the drawn character starts within a few px of the edge and is not clipped', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          repos: [
            RepositoryProvider<FetchProductDetailsUsecase>.value(value: FetchProductDetailsUsecase(_Products())),
            RepositoryProvider<ReviewRepository>.value(value: _Reviews()),
          ],
          blocs: [
            BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
            BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
          ],
          home: const ProductDetailScreen(productId: 'p1'),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final finder = _art(VisualSlots.productDetail);
      final box = tester.getRect(finder);
      // المقاس كما هو.
      expect(box.width, 132);

      // حيث تبدأ الشخصية فعلاً: الصندوق + الهامش الشفّاف للصورة بمقياس العرض.
      final path = CharacterArt.forSlot(VisualSlots.productDetail)!;
      final image = _pngSize(path);
      final margin = await _firstOpaqueColumn(tester, path) * (box.width / image.width);
      final drawnLeft = box.left + margin;

      // [CRITICAL] لا يُقصّ: أوّل بكسلٍ مرئي داخل الشاشة.
      expect(drawnLeft, greaterThanOrEqualTo(0), reason: 'character crosses the left edge — replacement 16.png has a narrower transparent margin; reduce _productArtOverhang');
      // أقرب من قبل: كان يبدأ على بعد ~٢٧ من الحافة؛ الآن بضع بكسلات.
      expect(drawnLeft, lessThanOrEqualTo(8));
      // وما خرج من الصندوق خلف الحافة شفّافٌ كلّه.
      expect(box.left, lessThan(0));
      expect(-box.left, lessThanOrEqualTo(margin));
      expect(tester.takeException(), isNull);
    });
  });
}
