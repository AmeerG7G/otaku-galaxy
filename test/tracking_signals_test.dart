// إشارات القياس التجميعي من جهة التطبيق (D3).
//
// [CRITICAL] مطفأة ما لم يعلن الخادم `tracking.enabled` — لا ترويسة ولا طلب.
// والمُشغَّلة تُرسَل حيث يجب فقط:
// - `X-OG-Track: view` عند فتح صفحة المنتج، لا عند إعادة جلبها بتبديل اللغة؛
// - `X-OG-Track: search` للبحث الذي بدأه المستخدم، لا لإعادة البحث باللغة الجديدة؛
// - نتيجة ورقة المشاركة كما يعيدها النظام (للحساب المسجَّل وحده)؛
// - لمسة إشعار الدفع — حتى لمسة الإقلاع ولمسة الترويج بلا وجهة.
// ولا إشارةٌ تُفشل شيئاً يراه الزبون.

import 'dart:async';
import 'dart:convert';

import 'package:auto_route/auto_route.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/core/tracking/tracking_signals.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/notifications/push/push_tap_router.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/products/data/repositories/product_repository_impl.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/search_products_usecase.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/search/data/search_history_storage.dart';
import 'package:otaku_galaxy/features/search/presentation/screens/search_screen.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

// ── شبكة مكتوبة ──

class _Reply {
  const _Reply(this.status, this.body);
  final int status;
  final Object body;
}

class _ScriptedAdapter implements HttpClientAdapter {
  final Map<String, _Reply> replies = {};
  final List<RequestOptions> requests = [];
  bool fail = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    if (fail) {
      throw DioException.connectionError(requestOptions: options, reason: 'مقطوع');
    }
    final key = '${options.method.toUpperCase()} ${options.uri.path}';
    final reply = replies[key] ?? const _Reply(204, '');
    return ResponseBody.fromString(
      reply.body is String ? reply.body as String : jsonEncode(reply.body),
      reply.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  List<RequestOptions> to(String method, String path) => requests
      .where((r) => r.method.toUpperCase() == method && r.uri.path == path)
      .toList();
}

Map<String, dynamic> _ok(Object? data) => {'success': true, 'data': data, 'message': 'ok'};

ApiClient _api(_ScriptedAdapter adapter, {String? token = 't0'}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))..httpClientAdapter = adapter;
  return ApiClient(config: AppConfig.development, dio: dio, tokenProvider: () => token);
}

/// إعداداتٌ يحدّد الاختبار حالة القياس فيها بلا شبكة.
class _Settings extends StoreSettingsRepository {
  _Settings({required this.enabled}) : super(api: ApiClient(config: AppConfig.development, dio: Dio()));

  bool enabled;

  @override
  bool get trackingEnabled => enabled;
  @override
  Future<void> get settled => Future<void>.value();
  @override
  Future<StoreSocialLinks> refresh() async => links;
}

/// تُسجَّل قبل استعمال الشاشات؛ الطلبات الخارجة تُرصد في المحوّل.
_ScriptedAdapter _registerTracking({required bool enabled, bool signedIn = true}) {
  final adapter = _ScriptedAdapter();
  final settings = _Settings(enabled: enabled);
  if (sl.isRegistered<TrackingSignals>()) sl.unregister<TrackingSignals>();
  if (sl.isRegistered<StoreSettingsRepository>()) sl.unregister<StoreSettingsRepository>();
  sl
    ..registerSingleton<StoreSettingsRepository>(settings)
    ..registerSingleton<TrackingSignals>(
      TrackingSignals(api: _api(adapter), settings: settings, signedIn: () => signedIn),
    );
  return adapter;
}

void _unregisterTracking() {
  if (sl.isRegistered<TrackingSignals>()) sl.unregister<TrackingSignals>();
  if (sl.isRegistered<StoreSettingsRepository>()) sl.unregister<StoreSettingsRepository>();
}

// ── كتالوج يسجّل ترويسات كل قراءة ──

Product _product() => const Product(
  id: '11111111-1111-4111-8111-111111111111',
  nameAr: 'مجسم لوفي',
  nameCkb: 'پەیکەری لوفی',
  descriptionAr: 'وصف',
  descriptionCkb: 'وەسف',
  price: 25000,
  images: [],
  stock: 5,
  categoryId: 'c1',
);

class _Catalog implements TrackedProductRepository {
  final List<Map<String, String>?> detailHeaders = [];
  final List<(String, Map<String, String>?)> searches = [];

  @override
  Future<Product> fetchProductDetails(String id, {Map<String, String>? headers}) async {
    detailHeaders.add(headers);
    return _product();
  }

  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
    Map<String, String>? headers,
  }) async {
    searches.add((query, headers));
    return const ProductPage(items: [], hasMore: false);
  }

  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(String categoryId, {ProductSort? sort}) async => const [];
  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({int page = 1, int limit = 20, String? categoryId, String? subcategoryId}) async =>
      const ProductPage(items: [], hasMore: false);
}

/// بديل اختبارٍ لا يعرف القدرة المتتبَّعة — كبدائل الاختبارات القائمة.
class _PlainCatalog implements ProductRepository {
  int details = 0;

  @override
  Future<Product> fetchProductDetails(String id) async {
    details += 1;
    return _product();
  }

  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20}) async =>
      const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(String categoryId, {ProductSort? sort}) async => const [];
  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({int page = 1, int limit = 20, String? categoryId, String? subcategoryId}) async =>
      const ProductPage(items: [], hasMore: false);
}

class _NoReviews implements ReviewRepository {
  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  Future<Review?> findReview({required String orderId, required String productId}) async => null;
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async => const [];
  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async => const [];
  @override
  Future<Review> submitReview({
    required String orderId,
    required String productId,
    required String productName,
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async => throw UnimplementedError();
  @override
  Future<Review> resubmitReview(
    String reviewId, {
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async => throw UnimplementedError();
}

/// `LocaleRefetch` يستمع إلى `LocaleCubit` — فتبديل اللغة هنا كما في التطبيق.
Widget _localized(LocaleCubit language, Widget home, {required List<Widget Function(Widget)> wrap}) {
  Widget app = MaterialApp(
    theme: AppTheme.light,
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => BlocBuilder<LocaleCubit, AppLanguage>(
      builder: (context, value) => LocaleScope(language: value, child: child ?? const SizedBox.shrink()),
    ),
    home: home,
  );
  app = BlocProvider<LocaleCubit>.value(value: language, child: app);
  for (final w in wrap.reversed) {
    app = w(app);
  }
  return app;
}

// ── مسجّل الجلسة للمصادقة ──

class _Storage implements AuthLocalStorage {
  String? _token = 't0';
  String? _userJson;
  @override
  bool get isLoggedIn => _token != null;
  @override
  String? get token => _token;
  @override
  String? getUserJson() => _userJson;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {
    _token = token;
    _userJson = userJson;
  }

  @override
  Future<void> updateUser(String userJson) async => _userJson = userJson;
  @override
  Future<void> logout() async => _token = _userJson = null;
}

Map<String, dynamic> _user() => {
  'id': 'u1',
  'username': 'زبون',
  'phone': '+9647701234567',
  'role': 'customer',
  'gender': 'male',
  'preferredLanguage': 'ar',
  'isPhoneVerified': true,
};

void main() {
  group('TrackingSignals', () {
    test('[CRITICAL] مطفأ افتراضياً: قبل جلب الإعدادات وبعد جلبٍ بلا `tracking` — لا ترويسة ولا طلب', () async {
      final adapter = _ScriptedAdapter()
        ..replies['GET /api/catalog/settings'] = _Reply(200, _ok({'social': {}, 'share': {}}));
      final settings = StoreSettingsRepository(api: _api(adapter));
      final signals = TrackingSignals(api: _api(adapter), settings: settings, signedIn: () => true);

      expect(signals.headerFor(TrackKind.view), isNull, reason: 'قبل أي جلب');
      await settings.refresh();
      expect(settings.trackingEnabled, isFalse);
      expect(signals.headerFor(TrackKind.search), isNull);

      await signals.share(_product().id, ShareResultStatus.success);
      await signals.notificationOpened('n1');
      expect(adapter.to('POST', '/api/tracking/share'), isEmpty);
      expect(adapter.to('POST', '/api/notifications/n1/opened'), isEmpty);
    });

    test('فشل جلب الإعدادات يُبقيه مطفأً', () async {
      final adapter = _ScriptedAdapter()..fail = true;
      final settings = StoreSettingsRepository(api: _api(adapter));
      await settings.refresh();
      expect(settings.trackingEnabled, isFalse);
    });

    test('`tracking.enabled: true` من الخادم: الترويسة بنوع الإشارة، والمشاركة بنتيجة النظام', () async {
      final adapter = _ScriptedAdapter()
        ..replies['GET /api/catalog/settings'] = _Reply(200, _ok({'tracking': {'enabled': true}}));
      final settings = StoreSettingsRepository(api: _api(adapter));
      final signals = TrackingSignals(api: _api(adapter), settings: settings, signedIn: () => true);
      await settings.refresh();

      expect(signals.headerFor(TrackKind.view), {'X-OG-Track': 'view'});
      expect(signals.headerFor(TrackKind.search), {'X-OG-Track': 'search'});

      for (final (status, wire) in [
        (ShareResultStatus.success, 'success'),
        (ShareResultStatus.dismissed, 'dismissed'),
        (ShareResultStatus.unavailable, 'unavailable'),
      ]) {
        adapter.requests.clear();
        await signals.share(_product().id, status);
        final sent = adapter.to('POST', '/api/tracking/share');
        expect(sent, hasLength(1));
        // المعرّف والنتيجة وحدهما — لا هوية ولا جهاز (الخادم يرفض أي حقلٍ آخر).
        expect(sent.single.data, {'productId': _product().id, 'result': wire});
      }
    });

    test('الزائر لا يرسل مشاركةً ولا فتحاً حتى والقياس مُشغَّل', () async {
      final adapter = _ScriptedAdapter();
      final signals = TrackingSignals(
        api: _api(adapter),
        settings: _Settings(enabled: true),
        signedIn: () => false,
      );
      await signals.share(_product().id, ShareResultStatus.success);
      await signals.notificationOpened('n1');
      expect(adapter.requests, isEmpty);
    });

    test('فشل الإرسال صامت — لا استثناء يصل إلى الشاشة', () async {
      final adapter = _ScriptedAdapter()..fail = true;
      final signals = TrackingSignals(api: _api(adapter), settings: _Settings(enabled: true), signedIn: () => true);
      await expectLater(signals.share(_product().id, ShareResultStatus.success), completes);
      await expectLater(signals.notificationOpened('n1'), completes);
      expect(adapter.requests, hasLength(2));
    });

    test('[CRITICAL] لمسة الإقلاع تنتظر جلب الإعدادات الجاري ثم تُرسَل', () async {
      final adapter = _ScriptedAdapter()
        ..replies['GET /api/catalog/settings'] = _Reply(200, _ok({'tracking': {'enabled': true}}));
      final settings = StoreSettingsRepository(api: _api(adapter));
      final signals = TrackingSignals(api: _api(adapter), settings: settings, signedIn: () => true);

      unawaited(settings.refresh()); // شاشة البداية لا تنتظره
      expect(settings.trackingEnabled, isFalse, reason: 'الجلب لم يكتمل بعد');
      await signals.notificationOpened('n1');
      expect(adapter.to('POST', '/api/notifications/n1/opened'), hasLength(1));
    });
  });

  group('قراءات الكتالوج المتتبَّعة', () {
    test('المستودع الحقيقي يرفق الترويسة حين تُطلب، ولا يرفقها حين لا تُطلب', () async {
      final adapter = _ScriptedAdapter()
        ..replies['GET /api/catalog/products/p1'] = _Reply(200, _ok({
          'id': 'p1', 'name': 'x', 'nameAr': 'x', 'price': 1, 'images': <String>[],
        }))
        ..replies['GET /api/catalog/products/search'] = _Reply(200, _ok({'items': <Object>[], 'hasMore': false}));
      final repo = ProductRepositoryImpl(api: _api(adapter));

      await FetchProductDetailsUsecase(repo)('p1', track: const {'X-OG-Track': 'view'});
      await FetchProductDetailsUsecase(repo)('p1');
      final details = adapter.to('GET', '/api/catalog/products/p1');
      expect(details[0].headers['X-OG-Track'], 'view');
      expect(details[1].headers.containsKey('X-OG-Track'), isFalse);

      await SearchProductsUsecase(repo)('لوفي', track: const {'X-OG-Track': 'search'});
      await SearchProductsUsecase(repo)('لوفي');
      final searches = adapter.to('GET', '/api/catalog/products/search');
      expect(searches[0].headers['X-OG-Track'], 'search');
      expect(searches[1].headers.containsKey('X-OG-Track'), isFalse);
    });

    test('مستودعٌ لا يعرف القدرة يسقط إلى القراءة العادية بلا خطأ', () async {
      final plain = _PlainCatalog();
      await FetchProductDetailsUsecase(plain)('p1', track: const {'X-OG-Track': 'view'});
      expect(plain.details, 1);
    });
  });

  group('PushTapRouter — لمسة الإشعار', () {
    test('[CRITICAL] اللمسة والتطبيق جاهز تُبلَّغ — حتى لمسة الترويج بلا وجهة', () {
      final opened = <String>[];
      final pushed = <PageRouteInfo<Object?>>[];
      final router = PushTapRouter((r) async => pushed.add(r), onOpened: opened.add)..markReady();

      router.handle({'notificationId': 'n1', 'orderId': 'o1'});
      router.handle({'notificationId': 'n2'}); // ترويج: لا وجهة، لكنه فتح التطبيق
      router.handle({'orderId': 'o2'}); // لا معرّف: لا إبلاغ

      expect(opened, ['n1', 'n2']);
      expect(pushed, hasLength(2));
      expect(pushed.first, isA<OrderDetailRoute>());
    });

    test('[CRITICAL] لمسة الإقلاع تُبلَّغ عند الجاهزية — مرّةً واحدة', () {
      final opened = <String>[];
      final router = PushTapRouter((r) async => null, onOpened: opened.add);

      router.handle({'notificationId': 'n1', 'productId': 'p1'});
      expect(opened, isEmpty, reason: 'قبل استعادة الجلسة لا يُرسَل شيء');
      router.markReady();
      router.markReady();
      expect(opened, ['n1']);
    });
  });

  test('[CRITICAL] تغيير كلمة المرور يعيد تسجيل الجهاز — والفشل لا يُفشل التغيير', () async {
    final adapter = _ScriptedAdapter()
      ..replies['GET /api/auth/me'] = _Reply(200, _ok({'user': _user()}))
      ..replies['PATCH /api/auth/me/password'] = _Reply(200, _ok({'token': 't1', 'user': _user()}));
    final storage = _Storage();
    final api = ApiClient(
      config: AppConfig.development,
      dio: Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))..httpClientAdapter = adapter,
      tokenProvider: () => storage.token,
    );
    final repo = AuthRepositoryImpl(api: api);
    var renewed = 0;
    final auth = AuthCubit(
      localStorage: storage,
      loginUsecase: LoginUsecase(repo),
      registerUsecase: RegisterUsecase(repo),
      forgotPasswordUsecase: ForgotPasswordUsecase(repo),
      getMeUsecase: GetMeUsecase(repo),
      updateProfileUsecase: UpdateProfileUsecase(repo),
      changePasswordUsecase: ChangePasswordUsecase(repo),
      onSessionRenewed: () async {
        renewed += 1;
        throw StateError('المزوّد غير متاح');
      },
    );
    await auth.loadSession();
    await auth.changePassword(currentPassword: 'old-secret', newPassword: 'new-secret');
    await Future<void>.delayed(Duration.zero);
    expect(storage.token, 't1');
    expect(renewed, 1);
    await auth.close();
  });

  group('الشاشات', () {
    setUpAll(loadProjectFonts);
    tearDown(_unregisterTracking);

    Future<void> pumpSearch(
      WidgetTester tester,
      _Catalog catalog,
      LocaleCubit language, {
      String initialQuery = '',
    }) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _localized(
          language,
          SearchScreen(initialQuery: initialQuery),
          wrap: [
            (child) => RepositoryProvider.value(value: SearchProductsUsecase(catalog), child: child),
            (child) => MultiBlocProvider(
              providers: [
                BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
                BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
              ],
              child: child,
            ),
          ],
        ),
      );
      await tester.pump();
    }

    Future<LocaleCubit> localeCubit() async {
      SharedPreferences.setMockInitialValues({});
      final cubit = LocaleCubit(await SharedPreferences.getInstance());
      addTearDown(cubit.close);
      return cubit;
    }

    Future<void> registerHistory() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      if (sl.isRegistered<SearchHistoryStorage>()) sl.unregister<SearchHistoryStorage>();
      sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
      addTearDown(() => sl.unregister<SearchHistoryStorage>());
    }

    testWidgets('[CRITICAL] البحث: الإرسال والاستعلام الأوّلي يُعلَنان، وإعادة البحث بتبديل اللغة لا تُعلَن', (tester) async {
      await registerHistory();
      _registerTracking(enabled: true);
      final catalog = _Catalog();
      final language = await localeCubit();
      await pumpSearch(tester, catalog, language, initialQuery: 'ناروتو');
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'لوفي');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();

      unawaited(language.setLanguage(AppLanguage.kurdish));
      await tester.pumpAndSettle();

      expect(catalog.searches.map((s) => s.$1), ['ناروتو', 'لوفي', 'لوفي']);
      expect(catalog.searches[0].$2, {'X-OG-Track': 'search'}, reason: 'الاستعلام الأوّلي');
      expect(catalog.searches[1].$2, {'X-OG-Track': 'search'}, reason: 'الإرسال');
      expect(catalog.searches[2].$2, isNull, reason: 'إعادة اللغة ليست بحثاً جديداً');
    });

    testWidgets('البحث والقياس مطفأ: لا ترويسة لأي بحث', (tester) async {
      await registerHistory();
      _registerTracking(enabled: false);
      final catalog = _Catalog();
      await pumpSearch(tester, catalog, await localeCubit(), initialQuery: 'ناروتو');
      await tester.pumpAndSettle();
      expect(catalog.searches.single.$2, isNull);
    });

    Future<void> pumpDetail(WidgetTester tester, _Catalog catalog, LocaleCubit language) async {
      tester.view.physicalSize = const Size(412, 915);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        _localized(
          language,
          ProductDetailScreen(productId: _product().id),
          wrap: [
            (child) => MultiRepositoryProvider(
              providers: [
                RepositoryProvider<FetchProductDetailsUsecase>.value(value: FetchProductDetailsUsecase(catalog)),
                RepositoryProvider<ReviewRepository>.value(value: _NoReviews()),
              ],
              child: child,
            ),
            (child) => MultiBlocProvider(
              providers: [
                BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
                BlocProvider<AuthCubit>.value(value: stubAuthCubit(gender: 'male')),
              ],
              child: child,
            ),
          ],
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets('[CRITICAL] صفحة المنتج: الفتح يُعلَن مرّة، وإعادة الجلب بتبديل اللغة لا تُعلَن', (tester) async {
      _registerTracking(enabled: true);
      final catalog = _Catalog();
      final language = await localeCubit();
      await pumpDetail(tester, catalog, language);

      unawaited(language.setLanguage(AppLanguage.kurdish));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(catalog.detailHeaders, [
        {'X-OG-Track': 'view'},
        null,
      ]);
    });

    testWidgets('[CRITICAL] المشاركة: نتيجة ورقة النظام تُرسَل إلى `/tracking/share`', (tester) async {
      final adapter = _registerTracking(enabled: true);
      const channel = MethodChannel('dev.fluttercommunity.plus/share');
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        (call) async => 'com.whatsapp', // اختار المستخدم تطبيقاً — نجاح
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));

      await pumpDetail(tester, _Catalog(), await localeCubit());
      await tester.tap(find.byIcon(Icons.ios_share_rounded));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      final sent = adapter.to('POST', '/api/tracking/share');
      expect(sent, hasLength(1));
      expect(sent.single.data, {'productId': _product().id, 'result': 'success'});
    });
  });
}
