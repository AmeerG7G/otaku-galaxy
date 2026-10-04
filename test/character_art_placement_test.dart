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
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
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
  AppLanguage language = AppLanguage.arabic,
  double textScale = 1.0,
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
      language: language,
      child: MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child ?? const SizedBox.shrink(),
      ),
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
    testWidgets(
      '20% larger (STEP 64): the bust still sits on the header bottom edge, x unchanged',
      (tester) async {
        await _pumpAuth(tester, const LoginRoute());
        final art = _art(VisualSlots.login);
        expect(art, findsOneWidget);
        final box = tester.getRect(art);
        final header = tester.getRect(
          find.ancestor(of: art, matching: find.byType(ClipRRect)).first,
        );

        // [STEP 64 §20] أكبر بـ٢٠٪: ١٣٨×١٩٦ ← ١٦٥٫٦×٢٣٥٫٢، والموضع الأفقي كما كان.
        expect(box.width, closeTo(138 * 1.2, 0.01));
        expect(box.height, closeTo(196 * 1.2, 0.01));
        expect(box.left, closeTo(header.left - 34, 0.01));

        // إزاحة القاع تكبر بالنسبة نفسها (٢٩ ← ٣٤٫٨) فيبقى القاع المرسوم على الحافة.
        expect(box.bottom - header.bottom, closeTo(29 * 1.2, 0.01));

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

  group(
    '«لنهيئ تجربتك» — [logo/title | character] → divider → «اختر لغتك» → controls (STEP 64 §21)',
    () {
      for (final (name, size, language, scale) in const [
        ('ar 412×892', _phoneSize, AppLanguage.arabic, 1.0),
        ('ckb 320×568 ×1.3', Size(320, 568), AppLanguage.kurdish, 1.3),
      ]) {
        testWidgets(
          '$name: the character stands ON the divider beside the title; nothing under the status bar',
          (tester) async {
            _phone(tester);
            tester.view.physicalSize = size;
            SharedPreferences.setMockInitialValues({});
            final prefs = await SharedPreferences.getInstance();
            await tester.pumpWidget(
              _app(
                language: language,
                textScale: scale,
                blocs: [
                  BlocProvider<LocaleCubit>(create: (_) => LocaleCubit(prefs)),
                  BlocProvider<ThemeCubit>(create: (_) => ThemeCubit(prefs)),
                ],
                home: const PersonalizeScreen(),
              ),
            );
            await tester.pump(const Duration(milliseconds: 300));
            expect(tester.takeException(), isNull);

            final strings = AppStrings.of(language);
            final title = tester.getRect(
              find.text(strings('personalizeTitle')),
            );
            final divider = tester.getRect(
              find.byKey(PersonalizeScreen.dividerKey),
            );
            final art = tester.getRect(_art(VisualSlots.personalize));
            final body = tester.getRect(find.text(strings('personalizeBody')));
            final languageLabel = tester.getRect(
              find.text(strings('language')),
            );

            // الشخصية فوق الخطّ، والخطّ تحتها مباشرة: قاع الصندوق على
            // الفاصل، والصورة مثبّتةٌ في قاع صندوقها (قاع 34.png مُعتِم).
            expect(art.bottom, closeTo(divider.top, 0.01));
            expect(
              tester
                  .widget<CharacterArtwork>(_art(VisualSlots.personalize))
                  .alignment,
              Alignment.bottomCenter,
            );
            // بجانب العنوان: هو جهة البداية (اليمين) وهي جهة النهاية، بلا تداخل.
            expect(title.bottom, lessThanOrEqualTo(divider.top));
            expect(
              title.bottom,
              greaterThan(art.top),
              reason: 'the title and the character share one row',
            );
            expect(art.right, lessThanOrEqualTo(title.left));
            // تحت الفاصل: الوصف فوراً ثم الاختيارات — لا فراغ ميت.
            expect(body.top, greaterThanOrEqualTo(divider.bottom));
            expect(body.top - divider.bottom, lessThanOrEqualTo(16));
            expect(languageLabel.top, greaterThan(body.bottom));
            // لا تداخل مع شريط الحالة، وداخل الشاشة أفقياً.
            expect(art.top, greaterThan(_statusBar));
            expect(title.top, greaterThanOrEqualTo(_statusBar));
            expect(art.left, greaterThanOrEqualTo(0));
            expect(art.right, lessThanOrEqualTo(size.width));
          },
        );
      }
    },
  );

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

  group('image 16 — product detail, touching the left edge, never crossing it', () {
    testWidgets(
      'the drawn character starts within a few px of the edge and is not clipped',
      (tester) async {
        _phone(tester);
        await tester.pumpWidget(
          _app(
            repos: [
              RepositoryProvider<FetchProductDetailsUsecase>.value(
                value: FetchProductDetailsUsecase(_Products()),
              ),
              RepositoryProvider<ReviewRepository>.value(value: _Reviews()),
            ],
            blocs: [
              BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
              BlocProvider<AuthCubit>(
                create: (_) => stubAuthCubit(gender: 'male'),
              ),
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
        expect(
          drawnLeft,
          greaterThanOrEqualTo(0),
          reason:
              'character crosses the left edge — replacement 16.png has a narrower transparent margin; reduce _productArtOverhang',
        );
        // [STEP 64 §18] «قليلاً إلى اليسار»: كان يبدأ على بعد ~٤ من الحافة
        // (الصندوق عند −٢٣)؛ الآن الصندوق أبعد بـ٤ والشخصية تلامس الحافة.
        expect(box.left, closeTo(-23 - 4, 0.01));
        expect(drawnLeft, lessThanOrEqualTo(1));
        // وما خرج من الصندوق خلف الحافة شفّافٌ كلّه.
        expect(box.left, lessThan(0));
        expect(-box.left, lessThanOrEqualTo(margin));
        expect(tester.takeException(), isNull);
      },
    );
  });

  group('«توصيل لكل المحافظات» — delivery assurance strip composition (image 11)', () {
    testWidgets('artwork height is 220 — intentional large-artwork design geometry', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final art = tester.widget<CharacterArtwork>(_art(VisualSlots.homeDelivery));
      expect(art.height, equals(220.0),
          reason: '220 is the owner-approved geometry; reverting to 116 breaks the design');
      expect(tester.takeException(), isNull);
    });

    testWidgets('artwork overflows the card — intentional design, not a clip violation', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final artRect = tester.getRect(_art(VisualSlots.homeDelivery));
      final cardRect = tester.getRect(find.byType(DeliveryAssuranceStrip));

      // bottom: −55 relative to a Stack inset 20 px = 35 px below the card outer
      // edge.  getRect returns the layout rect (not the visual/clipped rect), so
      // artRect.bottom > cardRect.bottom even though the Container's Clip.antiAlias
      // hides that overflow visually.  A value ≤ 0 means the geometry was reverted.
      expect(
        artRect.bottom - cardRect.bottom,
        greaterThan(0.0),
        reason: 'artwork layout must extend below the card (bottom:−55, stack-inset:20 → ~35 px); '
            'zero means the geometry was reverted to the old values',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('frame is foreground-only — border in foregroundDecoration, not decoration', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final containers = tester.widgetList<Container>(find.descendant(
        of: find.byType(DeliveryAssuranceStrip),
        matching: find.byType(Container),
      )).toList();

      // The card Container must carry the border in foregroundDecoration so it
      // is painted after the Stack's children (artwork included).
      final hasForegroundBorder = containers.any((c) =>
          c.foregroundDecoration is BoxDecoration &&
          (c.foregroundDecoration! as BoxDecoration).border != null);
      expect(hasForegroundBorder, isTrue,
          reason: 'border must be in foregroundDecoration to render above the artwork');

      // No Container may carry a border in both decoration AND foregroundDecoration
      // — that produces a double stroke.
      final hasDuplicate = containers.any((c) =>
          c.decoration is BoxDecoration &&
          (c.decoration! as BoxDecoration).border != null &&
          c.foregroundDecoration is BoxDecoration &&
          (c.foregroundDecoration! as BoxDecoration).border != null);
      expect(hasDuplicate, isFalse, reason: 'duplicate border doubles the stroke width');

      expect(tester.takeException(), isNull);
    });

    // Container.clipBehavior must be Clip.antiAlias so that:
    //   (a) the artwork overflow is clipped to the card's rounded-rect shape
    //       (character appears behind the card, not in front of it), and
    //   (b) the foregroundDecoration border (outside the ClipPath in Flutter's
    //       Container.build chain) is not clipped and paints on top.
    // Do NOT change this to Clip.none: Clip.none leaves the artwork visible
    // outside the card, making the character appear in front of the frame.
    testWidgets('Container.clipBehavior is Clip.antiAlias — artwork is clipped to card shape', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final containers = tester.widgetList<Container>(find.descendant(
        of: find.byType(DeliveryAssuranceStrip),
        matching: find.byType(Container),
      )).toList();

      final cardContainer = containers.firstWhere(
        (c) =>
            c.foregroundDecoration is BoxDecoration &&
            (c.foregroundDecoration! as BoxDecoration).border != null,
      );
      // Must be Clip.antiAlias: clips artwork at the card boundary → character
      // disappears behind the card; the foreground border paints on top.
      expect(cardContainer.clipBehavior, equals(Clip.antiAlias),
          reason: 'Container must use Clip.antiAlias so the artwork is clipped to '
              'the card shape; Clip.none leaves the character visible outside the '
              'card making it appear in front of the frame');

      expect(tester.takeException(), isNull);
    });

    testWidgets('Stack.clipBehavior is Clip.none — artwork can overflow Stack into padding zone', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final stackFinder = find.descendant(
        of: find.byType(DeliveryAssuranceStrip),
        matching: find.byType(Stack),
      );
      final stack = tester.widget<Stack>(stackFinder);
      // Stack must be Clip.none so the artwork's bottom:−55 / end:−83 can
      // overflow the Stack's content bounds into the card's 20 px padding zone
      // before being clipped by the Container's Clip.antiAlias boundary.
      // Clip.hardEdge here would cut the artwork 20 px early.
      expect(stack.clipBehavior, equals(Clip.none),
          reason: 'Stack must be Clip.none so artwork fills the padding zone');

      expect(tester.takeException(), isNull);
    });

    testWidgets('frame is structurally above artwork — foreground outside ClipPath guarantees occlusion', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final containers = tester.widgetList<Container>(find.descendant(
        of: find.byType(DeliveryAssuranceStrip),
        matching: find.byType(Container),
      )).toList();

      final cardContainer = containers.firstWhere(
        (c) =>
            c.foregroundDecoration is BoxDecoration &&
            (c.foregroundDecoration! as BoxDecoration).border != null,
      );

      // The three structural invariants that together guarantee the frame
      // visually covers the artwork at every card edge:
      //   1. foregroundDecoration carries the border (not decoration)
      //   2. clipBehavior is Clip.antiAlias (clips artwork at card shape)
      //   3. decoration carries NO border (no background stroke)
      //
      // Flutter's Container.build places the foregroundDecoration DecoratedBox
      // OUTSIDE the ClipPath it creates for clipBehavior, so the border paints
      // after the clip is restored — it is never clipped and always on top.

      // invariant 1 — border is in foreground
      final fgDeco = cardContainer.foregroundDecoration as BoxDecoration;
      expect(fgDeco.border, isNotNull,
          reason: 'border must be in foregroundDecoration (paints after clip)');

      // invariant 2 — container clips with antiAlias
      expect(cardContainer.clipBehavior, equals(Clip.antiAlias),
          reason: 'Clip.antiAlias makes artwork disappear behind the card');

      // invariant 3 — no background border (would be behind artwork)
      final bgDeco = cardContainer.decoration as BoxDecoration?;
      expect(bgDeco?.border, isNull,
          reason: 'no border in background decoration; it would paint behind artwork');

      expect(tester.takeException(), isNull);
    });

    testWidgets('no patch widget — Stack has exactly artwork + text children', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final stackFinder = find.descendant(
        of: find.byType(DeliveryAssuranceStrip),
        matching: find.byType(Stack),
      );
      expect(stackFinder, findsOneWidget,
          reason: 'DeliveryAssuranceStrip must contain exactly one Stack');

      final stack = tester.widget<Stack>(stackFinder);
      expect(stack.children.length, equals(2),
          reason: 'Stack must have exactly 2 children (artwork + text column); '
              'a 3rd child is the broken patch widget');

      expect(tester.takeException(), isNull);
    });

    for (final width in [360.0, 390.0, 412.0]) {
      testWidgets('artwork overflows at ${width.toInt()} dp — overflow geometry holds across phone widths',
          (tester) async {
        tester.view.physicalSize = Size(width, 892);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
        );

        final artRect = tester.getRect(_art(VisualSlots.homeDelivery));
        final cardRect = tester.getRect(find.byType(DeliveryAssuranceStrip));

        expect(
          artRect.bottom - cardRect.bottom,
          greaterThan(0.0),
          reason: 'artwork must extend below the card at ${width.toInt()} dp; '
              'geometry is absolute (bottom:−55), not width-dependent',
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('LTR — artwork positioned at end side (right in LTR)', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.ltr,
              child: const DeliveryAssuranceStrip(),
            ),
          ),
        ),
      );

      final artRect = tester.getRect(_art(VisualSlots.homeDelivery));
      final cardRect = tester.getRect(find.byType(DeliveryAssuranceStrip));

      // In LTR, end = right. Artwork must be in the right half of the card.
      expect(artRect.right, greaterThan(cardRect.center.dx),
          reason: 'PositionedDirectional(end:−83) must place the artwork at the '
              'right end of the card in LTR');

      // Bottom overflow must still hold in LTR.
      expect(artRect.bottom - cardRect.bottom, greaterThan(0.0),
          reason: 'bottom overflow must be independent of text direction');
      expect(tester.takeException(), isNull);
    });

    testWidgets('RTL — artwork positioned at end side (left in RTL)', (tester) async {
      _phone(tester);
      await tester.pumpWidget(
        _app(home: const Scaffold(body: DeliveryAssuranceStrip())),
      );

      final artRect = tester.getRect(_art(VisualSlots.homeDelivery));
      final cardRect = tester.getRect(find.byType(DeliveryAssuranceStrip));

      // In RTL (Arabic), end = left. Artwork must be in the left half of the card.
      expect(artRect.left, lessThan(cardRect.center.dx),
          reason: 'PositionedDirectional(end:−83) must place the artwork at the '
              'left end of the card in RTL (Arabic)');

      expect(artRect.bottom - cardRect.bottom, greaterThan(0.0),
          reason: 'bottom overflow must hold in RTL');
      expect(tester.takeException(), isNull);
    });
  });
}
