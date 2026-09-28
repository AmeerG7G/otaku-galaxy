// [CRITICAL] محتوى المنتج بلغتين — الاسم والوصف بالعربية وبالكردية (هجرة ٠٦٦).
//
// ما يُحرس هنا:
//   ١. الحقول الأربعة تعبر كل تحويل كما هي (المنتج، سطر السلة، لقطة الطلب،
//      التقييم، المفضلة) — لا حقل «name» واحد يضيع فيه نصف المحتوى.
//   ٢. الاختيار بلغة الواجهة **الحالية** (`LocaleScope`) لا بلغة الجلب: تبديل
//      اللغة يبدّل الاسم المعروض بلا جلبٍ ثانٍ.
//   ٣. الكردية الناقصة (منتج قديم) تُعرض عربيةً **مع إعلان** — لا تُعرض العربية
//      على أنها كردية، ولا يظهر الإعلان في الواجهة العربية.
//   ٤. البحث يُعاد بلغة الواجهة الجديدة وتُعرض نتائجه بها.
//
// محتوى المنتج بيانات من الخادم — لا يدخل `AppStrings` أبداً؛ الإعلان وحده نصّ
// واجهة (`productKurdishMissingNote`).

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/bilingual_text.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/data/repositories/cart_repository_impl.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/cart/presentation/screens/cart_screen.dart';
import 'package:otaku_galaxy/features/favorites/data/repositories/favorites_repository_impl.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
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
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/rate_order_screen.dart';
import 'package:otaku_galaxy/features/search/data/search_history_storage.dart';
import 'package:otaku_galaxy/features/search/presentation/screens/search_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

// ═══════════════════════ البيانات ═══════════════════════

const _nameAr = 'حقيبة ناروتو';
const _nameCkb = 'جانتای ناروتۆ';
const _descAr = 'حقيبة مدرسية بتصميم ناروتو';
const _descCkb = 'جانتای قوتابخانە بە دیزاینی ناروتۆ';

const _bilingual = Product(
  id: 'p1',
  nameAr: _nameAr,
  nameCkb: _nameCkb,
  descriptionAr: _descAr,
  descriptionCkb: _descCkb,
  price: 25000,
  images: [],
  stock: 5,
  categoryId: 'c1',
);

/// منتجٌ أقدم من الإلزام: عربيٌّ وحده.
const _legacy = Product(
  id: 'p2',
  nameAr: 'مجسم قديم',
  descriptionAr: 'وصف قديم',
  price: 9000,
  images: [],
  stock: 3,
  categoryId: 'c1',
);

final _missingNoteCkb = AppStrings.kurdish('productKurdishMissingNote');

Map<String, dynamic> _productJson({
  String? nameCkb = _nameCkb,
  String? descriptionCkb = _descCkb,
}) => {
  'id': 'p1',
  // `name`/`description` المحسومان بلغة الطلب — يجب ألّا يُقرآ متى حضرت الأربعة.
  'name': 'محسوم',
  'description': 'محسوم',
  'nameAr': _nameAr,
  'descriptionAr': _descAr,
  'nameCkb': nameCkb,
  'descriptionCkb': descriptionCkb,
  'kurdishMissing': nameCkb == null || descriptionCkb == null,
  'price': 25000,
  'stock': 5,
  'images': <String>[],
};

// ═══════════════════════ بدائل ═══════════════════════

/// عميل API يردّ بما يُعطى — يقف مقام الخادم في مستودعات البيانات.
class _FakeApi extends ApiClient {
  _FakeApi(this.response);

  final Object response;

  @override
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async => response;
}

class _Products implements ProductRepository {
  _Products({this.detail = _bilingual, this.onSearch});

  final Product detail;
  final ProductPage Function(String query)? onSearch;
  final queries = <String>[];

  @override
  Future<Product> fetchProductDetails(String id) async => detail;
  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20, ProductSort? sort}) async {
    queries.add(query);
    return onSearch?.call(query) ?? const ProductPage(items: [], hasMore: false);
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

class _Cart implements CartRepository {
  _Cart(this.items);

  final List<CartItem> items;

  @override
  Future<List<CartItem>> fetchCart() async => items;
  @override
  Future<CartSnapshot> syncCart() async => CartSnapshot(items: items);
  @override
  Future<List<CartItem>> addToCart(String productId, {int quantity = 1, String? optionValue}) async => items;
  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async => items;
  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => items;
}

// ═══════════════════════ حوامل العرض ═══════════════════════

/// التطبيق مصغّراً: `LocaleScope` فوق المسار كما في `app.dart` — هو مصدر
/// `context.language`، وتغيّره يعيد رسم كل من قرأ اسماً.
Widget _app({
  required AppLanguage language,
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
      language: language,
      child: child ?? const SizedBox.shrink(),
    ),
    home: home,
  );
  final withBlocs = blocs.isEmpty ? app : MultiBlocProvider(providers: blocs, child: app);
  return repos.isEmpty ? withBlocs : MultiRepositoryProvider(providers: repos, child: withBlocs);
}

void _phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 915);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(loadProjectFonts);

  // ═══ ١ · البيانات ═══

  group('الحقول الأربعة تعبر كل تحويل كما هي', () {
    test('Product.fromJson يقرأ الأربعة الصريحة — لا `name` المحسوم', () {
      final product = Product.fromJson(_productJson());
      expect(product.nameAr, _nameAr);
      expect(product.nameCkb, _nameCkb);
      expect(product.descriptionAr, _descAr);
      expect(product.descriptionCkb, _descCkb);
      expect(product.kurdishMissing, isFalse);
    });

    test('copyWith يحفظ الأربعة', () {
      final copy = Product.fromJson(_productJson()).copyWith(inFavorites: true);
      expect(
        [copy.nameAr, copy.nameCkb, copy.descriptionAr, copy.descriptionCkb],
        [_nameAr, _nameCkb, _descAr, _descCkb],
      );
    });

    test('الكردية الناقصة أو الفارغة ⇒ `null` صريحة — لا نصٌّ فارغ ولا عربيٌّ منسوخ', () {
      final missing = Product.fromJson(_productJson(nameCkb: null, descriptionCkb: '   '));
      expect(missing.nameCkb, isNull);
      expect(missing.descriptionCkb, isNull);
      expect(missing.kurdishMissing, isTrue);
      expect(missing.nameAr, _nameAr);
    });

    test('ردٌّ أقدم بنصٍّ واحد يُقرأ عربياً بلا كردية — لا انهيار', () {
      final old = Product.fromJson({'id': 'x', 'name': 'اسم', 'description': 'وصف', 'price': 1});
      expect(old.nameAr, 'اسم');
      expect(old.descriptionAr, 'وصف');
      expect(old.nameCkb, isNull);
    });

    test('لقطة الطلب: الاسمان يصلان المنتج المعروض، والطلب القديم بلا كردية', () {
      final order = Order.fromJson({
        'id': 'o1',
        'status': 'COMPLETED',
        'items': [
          {'productId': 'p1', 'productName': _nameAr, 'productNameAr': _nameAr, 'productNameCkb': _nameCkb, 'price': 1000, 'quantity': 1},
          {'productId': 'p2', 'productName': 'قديم', 'price': 1000, 'quantity': 1},
        ],
      });
      expect(order.items[0].product.names, const BilingualText(ar: _nameAr, ckb: _nameCkb));
      expect(order.items[1].product.names, const BilingualText(ar: 'قديم'));
    });

    test('التقييم: fromJson/toJson يحفظان اللقطتين', () {
      final json = {
        'id': 'r1',
        'productId': 'p1',
        'productName': _nameAr,
        'productNameAr': _nameAr,
        'productNameCkb': _nameCkb,
        'orderId': 'o1',
        'rating': 5,
        'comment': 'ممتاز',
        'photoUrls': <String>[],
        'status': 'approved',
        'customerName': 'زبون',
        'createdAt': '2026-09-27T10:00:00.000Z',
      };
      final review = Review.fromJson(json);
      expect(review.productNames, const BilingualText(ar: _nameAr, ckb: _nameCkb));
      final again = Review.fromJson({...review.toJson(), 'createdAt': json['createdAt']});
      expect(again.productNames, review.productNames);
    });

    test('سطر السلة من الخادم يحمل الاسمين إلى المنتج المعروض', () async {
      final repo = CartRepositoryImpl(
        api: _FakeApi({
          'items': [
            {'id': 'l1', 'productId': 'p1', 'productName': _nameAr, 'productNameAr': _nameAr, 'productNameCkb': _nameCkb, 'unitPrice': 25000, 'quantity': 2, 'stock': 5},
            {'id': 'l2', 'productId': 'p2', 'productName': 'قديم', 'productNameAr': 'قديم', 'productNameCkb': null, 'unitPrice': 9000, 'quantity': 1, 'stock': 3},
          ],
        }),
      );
      final items = await repo.fetchCart();
      expect(items[0].product.names, const BilingualText(ar: _nameAr, ckb: _nameCkb));
      expect(items[1].product.nameCkb, isNull);
    });

    test('المفضلة تحفظ الأربعة', () async {
      final repo = FavoritesRepositoryImpl(api: _FakeApi({'items': [_productJson()]}));
      final favorites = await repo.fetchFavorites();
      expect(favorites.single.nameCkb, _nameCkb);
      expect(favorites.single.descriptionCkb, _descCkb);
      expect(favorites.single.nameAr, _nameAr);
    });
  });

  // ═══ ٢ · الاختيار ═══

  group('الاختيار بلغة الواجهة — القاعدة نفسها على الخادم', () {
    test('العربية ⇒ العربي، والكردية ⇒ الكردي', () {
      expect(localizedProductName(_bilingual, AppLanguage.arabic), _nameAr);
      expect(localizedProductDescription(_bilingual, AppLanguage.arabic), _descAr);
      expect(localizedProductName(_bilingual, AppLanguage.kurdish), _nameCkb);
      expect(localizedProductDescription(_bilingual, AppLanguage.kurdish), _descCkb);
    });

    test('الكردية الناقصة ⇒ العربي معروضاً ومُعلَناً سقوطاً', () {
      expect(localizedProductName(_legacy, AppLanguage.kurdish), 'مجسم قديم');
      expect(_legacy.names.isFallbackIn(AppLanguage.kurdish), isTrue);
      expect(_legacy.names.isFallbackIn(AppLanguage.arabic), isFalse);
      expect(_bilingual.names.isFallbackIn(AppLanguage.kurdish), isFalse);
    });
  });

  // ═══ ٣ · العرض ═══

  group('بطاقة المنتج وصفّه — الرئيسية، الأقسام، المفضلة، البحث', () {
    for (final (language, shown, hidden) in [
      (AppLanguage.arabic, _nameAr, _nameCkb),
      (AppLanguage.kurdish, _nameCkb, _nameAr),
    ]) {
      testWidgets('${language.code}: البطاقة والصفّ يعرضان «$shown» وحده', (tester) async {
        _phone(tester);
        await tester.pumpWidget(
          _app(
            language: language,
            home: Scaffold(
              body: Column(
                children: [
                  const SizedBox(width: 180, height: 330, child: AnimeProductCard(product: _bilingual)),
                  AnimeProductRow(product: _bilingual, onTap: () {}),
                ],
              ),
            ),
          ),
        );
        await tester.pump();
        expect(find.text(shown), findsNWidgets(2));
        expect(find.text(hidden), findsNothing);
      });
    }

    testWidgets('[CRITICAL] تبديل اللغة يبدّل الاسم فوراً — بلا جلبٍ ثانٍ', (tester) async {
      _phone(tester);
      var language = AppLanguage.arabic;
      late StateSetter rebuild;
      await tester.pumpWidget(
        StatefulBuilder(
          builder: (context, setState) {
            rebuild = setState;
            return _app(
              language: language,
              home: const Scaffold(
                body: SizedBox(width: 180, height: 330, child: AnimeProductCard(product: _bilingual)),
              ),
            );
          },
        ),
      );
      await tester.pump();
      expect(find.text(_nameAr), findsOneWidget);

      rebuild(() => language = AppLanguage.kurdish);
      await tester.pump();
      expect(find.text(_nameCkb), findsOneWidget);
      expect(find.text(_nameAr), findsNothing);
    });
  });

  group('تفاصيل المنتج', () {
    Future<void> pumpDetail(WidgetTester tester, AppLanguage language, Product product) async {
      _phone(tester);
      final auth = stubAuthCubit(gender: 'male');
      await tester.pumpWidget(
        _app(
          language: language,
          repos: [
            RepositoryProvider<FetchProductDetailsUsecase>.value(
              value: FetchProductDetailsUsecase(_Products(detail: product)),
            ),
            RepositoryProvider<ReviewRepository>.value(value: _NoReviews()),
          ],
          blocs: [
            BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
            BlocProvider<AuthCubit>.value(value: auth),
          ],
          home: ProductDetailScreen(productId: product.id),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
    }

    testWidgets('العربية: الاسم والوصف العربيان — بلا إعلان', (tester) async {
      await pumpDetail(tester, AppLanguage.arabic, _bilingual);
      expect(find.text(_nameAr), findsOneWidget);
      expect(find.text(_descAr), findsOneWidget);
      expect(find.text(_nameCkb), findsNothing);
      expect(find.text(_descCkb), findsNothing);
    });

    testWidgets('الكردية: الاسم والوصف الكرديان — بلا إعلان', (tester) async {
      await pumpDetail(tester, AppLanguage.kurdish, _bilingual);
      expect(find.text(_nameCkb), findsOneWidget);
      expect(find.text(_descCkb), findsOneWidget);
      expect(find.text(_nameAr), findsNothing);
      expect(find.text(_missingNoteCkb), findsNothing);
    });

    testWidgets('[CRITICAL] منتجٌ قديم في الكردية: العربي معروضاً **مع** إعلان النقص', (tester) async {
      await pumpDetail(tester, AppLanguage.kurdish, _legacy);
      expect(find.text('مجسم قديم'), findsOneWidget);
      expect(find.text('وصف قديم'), findsOneWidget);
      expect(find.text(_missingNoteCkb), findsOneWidget);
    });

    testWidgets('المنتج القديم في العربية لا إعلان له — العربية ليست سقوطاً هنا', (tester) async {
      await pumpDetail(tester, AppLanguage.arabic, _legacy);
      expect(find.text('مجسم قديم'), findsOneWidget);
      expect(find.text(AppStrings.arabic('productKurdishMissingNote')), findsNothing);
    });
  });

  group('السلة والطلب', () {
    testWidgets('السلة تسمّي المنتج بلغة الواجهة', (tester) async {
      _phone(tester);
      final auth = stubAuthCubit(gender: 'male');
      await auth.loadSession();
      final cart = CartCubit(_Cart([const CartItem(product: _bilingual, quantity: 1, lineId: 'l1')]));
      await cart.load();
      await tester.pumpWidget(
        _app(
          language: AppLanguage.kurdish,
          blocs: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<CartCubit>.value(value: cart),
          ],
          home: const Scaffold(body: CartScreen()),
        ),
      );
      await tester.pump();
      expect(find.text(_nameCkb), findsOneWidget);
      expect(find.text(_nameAr), findsNothing);
    });

    testWidgets('منتجات الطلب (شاشة التقييم) تُعرض من لقطة الطلب بلغة الواجهة', (tester) async {
      _phone(tester);
      final auth = stubAuthCubit(gender: 'male');
      await auth.loadSession();
      final order = Order(
        id: 'o1',
        number: '1001',
        province: 'بغداد',
        deliveryCost: 5000,
        fullAddress: 'الكرادة',
        phone: '+9647701234567',
        total: 30000,
        status: OrderStatus.completed,
        items: const [CartItem(product: _bilingual), CartItem(product: _legacy)],
        canReview: true,
        reviewableProductCount: 2,
      );
      await tester.pumpWidget(
        _app(
          language: AppLanguage.kurdish,
          blocs: [
            BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(_NoReviews())),
            BlocProvider<AuthCubit>.value(value: auth),
          ],
          home: RateOrderScreen(order: order),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(_nameCkb), findsOneWidget);
      // لقطة بلا كردية: عربيّها — لا نصٌّ كرديٌّ مختلَق.
      expect(find.text('مجسم قديم'), findsOneWidget);
      expect(find.text(_nameAr), findsNothing);
    });
  });

  group('[CRITICAL] البحث بلغة الواجهة', () {
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      if (sl.isRegistered<SearchHistoryStorage>()) sl.unregister<SearchHistoryStorage>();
      sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
    });

    tearDown(() => sl.unregister<SearchHistoryStorage>());

    testWidgets('النتائج تُعرض بالكردية، وتبديل اللغة يعيد البحث ويعرض بالعربية', (tester) async {
      _phone(tester);
      final repo = _Products(
        onSearch: (_) => const ProductPage(items: [_bilingual], hasMore: false),
      );
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final locale = LocaleCubit(prefs);
      addTearDown(locale.close);
      await locale.setLanguage(AppLanguage.kurdish);

      await tester.pumpWidget(
        RepositoryProvider.value(
          value: SearchProductsUsecase(repo),
          child: MultiBlocProvider(
            providers: [
              BlocProvider<LocaleCubit>.value(value: locale),
              BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
              BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
            ],
            child: BlocBuilder<LocaleCubit, AppLanguage>(
              builder: (context, language) => _app(language: language, home: const SearchScreen()),
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField).first, 'ناروتۆ');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      await tester.pump();
      expect(find.text(_nameCkb), findsOneWidget);
      expect(repo.queries, ['ناروتۆ']);

      await locale.setLanguage(AppLanguage.arabic);
      await tester.pump();
      await tester.pump();
      // المطابقة بلغة الطلب — فالبحث يُعاد، لا الأسماء وحدها تُبدَّل.
      expect(repo.queries, ['ناروتۆ', 'ناروتۆ']);
      expect(find.text(_nameAr), findsOneWidget);
      expect(find.text(_nameCkb), findsNothing);
    });
  });
}
