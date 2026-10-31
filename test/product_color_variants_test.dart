// ألوان المنتج في التطبيق (STEP 74، هجرة 087 — docs/staging/color-variants-contract.md §2–4).
//
// لكل لونٍ صورته ومخزونه. يُقاس هنا: القراءة من الخادم (بألوان وبلا ألوان،
// وسقوط الكردية إلى العربية)، ومُنتقي الألوان في صفحة المنتج (تبديل الصورة
// والتوفر، اللون النافد معطَّل، لا إضافة بلا لون، `variantId` المرسَل)،
// وعرض لون السطر في السلة والمراجعة وتفاصيل الطلب. المنتج القديم كما كان.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/data/repositories/cart_repository_impl.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/cart/presentation/screens/cart_screen.dart';
import 'package:otaku_galaxy/features/cart/presentation/widgets/line_color_label.dart';
import 'package:otaku_galaxy/features/checkout/presentation/screens/order_review_screen.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_order_details_usecase.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

// ═══════════════════════ البيانات ═══════════════════════

const _mainImage = 'https://cdn.test/main.png';
const _redImage = 'https://cdn.test/red.png';
const _blueImage = 'https://cdn.test/blue.png';

Map<String, dynamic> _variantJson({
  required String id,
  required String ar,
  String? ckb,
  String? hex,
  required String image,
  required int stock,
  bool active = true,
  required int sort,
}) => {
  'id': id,
  'colorName': ckb ?? ar,
  'colorNameAr': ar,
  'colorNameCkb': ckb,
  'colorHex': hex,
  'imageUrl': image,
  'stock': stock,
  'isActive': active,
  'sortOrder': sort,
};

Map<String, dynamic> _productJson({List<Object?>? variants, int stock = 2}) => {
  'id': 'p1',
  'nameAr': 'هودي ناروتو',
  'nameCkb': 'هودی ناروتۆ',
  'descriptionAr': 'وصف',
  'descriptionCkb': 'وەسف',
  'price': 25000,
  'images': [_mainImage],
  'stock': stock,
  'variants': ?variants,
};

/// أحمر (٢ قطعة، بلونٍ معلن)، أزرق نفد (بلا لون — صورته مصغّرة)، أخضر غير
/// فعّال — بترتيبٍ معكوس في القائمة ليُقاس الترتيب بـ`sortOrder`.
List<Object?> _threeColours() => [
  _variantJson(id: 'green', ar: 'أخضر', ckb: 'سەوز', hex: '#2E7D32', image: 'https://cdn.test/green.png', stock: 9, active: false, sort: 2),
  _variantJson(id: 'blue', ar: 'أزرق', image: _blueImage, stock: 0, sort: 1),
  _variantJson(id: 'red', ar: 'أحمر', ckb: 'سوور', hex: '#E53935', image: _redImage, stock: 2, sort: 0),
];

Product _variantProduct() => Product.fromJson(_productJson(variants: _threeColours()));

Product _legacyProduct() => Product.fromJson(_productJson(stock: 5));

// ═══════════════════════ بدائل الطبقة السفلى ═══════════════════════

class _Products implements ProductRepository {
  _Products(this.detail);

  Product detail;
  int fetches = 0;

  @override
  Future<Product> fetchProductDetails(String id) async {
    fetches++;
    return detail;
  }

  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20, ProductSort? sort}) async =>
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
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async => const [];
  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async => const [];
  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// عربةٌ تسجّل ما طُلب منها، وترفض إن طُلب منها الرفض.
class _RecordingCart implements CartRepository {
  _RecordingCart([this.items = const []]);

  List<CartItem> items;
  final List<({String productId, String? variantId, int quantity})> adds = [];
  AppException? rejectWith;

  @override
  Future<List<CartItem>> fetchCart() async => items;
  @override
  Future<CartSnapshot> syncCart() async => CartSnapshot(items: items);
  @override
  Future<List<CartItem>> addToCart(
    String productId, {
    String? optionValue,
    String? variantId,
    int quantity = 1,
  }) async {
    adds.add((productId: productId, variantId: variantId, quantity: quantity));
    final failure = rejectWith;
    if (failure != null) throw failure;
    return items;
  }

  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async => items;
  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => items;
}

class _Orders implements OrderRepository {
  _Orders(this.order);

  final Order order;

  @override
  Future<Order> fetchOrderDetails(String id) async => order;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// خادمٌ يعيد سطر سلةٍ ملوَّناً ويحفظ جسم آخر طلب.
class _CartWire implements HttpClientAdapter {
  Map<String, dynamic>? lastBody;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (requestStream != null) {
      final bytes = await requestStream.expand((c) => c).toList();
      lastBody = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
    }
    final body = jsonEncode({
      'success': true,
      'data': {
        'item': null,
        'cart': {'items': [_colouredLineJson()]},
      },
      'message': null,
    });
    return ResponseBody.fromString(
      body,
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _colouredLineJson() => {
  'id': 'l1',
  'productId': 'p1',
  'productName': 'هودي ناروتو',
  'productNameAr': 'هودي ناروتو',
  'productNameCkb': 'هودی ناروتۆ',
  'productImage': _redImage,
  'optionValue': null,
  'quantity': 1,
  'unitPrice': 25000,
  'lineTotal': 25000,
  'stock': 2,
  'variantId': 'red',
  // [contract §3] في السطر الاسم العربي، لا المحسوم بلغة الطلب.
  'variantColorName': 'أحمر',
  'variantColorNameAr': 'أحمر',
  'variantColorNameCkb': 'سوور',
  'variantColorHex': '#E53935',
};

// ═══════════════════════ حوامل العرض ═══════════════════════

Widget _app({required AppLanguage language, required Widget home}) => MaterialApp(
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

void _phone(WidgetTester tester, {double height = 2200}) {
  tester.view.physicalSize = Size(412, height);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

Future<(_Products, _RecordingCart)> _pumpDetail(
  WidgetTester tester,
  Product product, {
  AppLanguage language = AppLanguage.arabic,
}) async {
  _phone(tester);
  final products = _Products(product);
  final cartRepo = _RecordingCart();
  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<FetchProductDetailsUsecase>.value(
          value: FetchProductDetailsUsecase(products),
        ),
        RepositoryProvider<ReviewRepository>.value(value: _NoReviews()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<CartCubit>(create: (_) => CartCubit(cartRepo)),
        ],
        child: _app(
          language: language,
          home: ProductDetailScreen(productId: product.id),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return (products, cartRepo);
}

String? _heroUrl(WidgetTester tester) => tester
    .widget<ProductPhotoSlot>(find.byKey(const Key('product_hero_image')))
    .imageUrl;

AnimePrimaryButton _addButton(WidgetTester tester) =>
    tester.widget<AnimePrimaryButton>(find.byKey(const Key('product_add_to_cart')));

Finder _colour(String id) => find.byKey(Key('color_option_$id'));

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
  await tester.tap(finder, warnIfMissed: false);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

/// صور الشبكة تفشل في بيئة الاختبار (HTTP 400) وتُعرض بديلاتها — ليست موضوع
/// هذه الاختبارات.
void _drainImageErrors(WidgetTester tester) {
  Object? error;
  while ((error = tester.takeException()) != null) {
    if (error is! NetworkImageLoadException) throw error!;
  }
}

void main() {
  setUpAll(loadProjectFonts);

  // ═══ ١ · القراءة من الخادم ═══

  group('Product.variants', () {
    test('منتجٌ قديم — الحقل غائب أو `[]`: بلا ألوان وتوفّره كما كان', () {
      for (final json in [_productJson(stock: 5), _productJson(variants: const [], stock: 5)]) {
        final product = Product.fromJson(json);
        expect(product.variants, isEmpty);
        expect(product.hasVariants, isFalse);
        expect(product.activeVariants, isEmpty);
        expect(product.inStock, isTrue);
        expect(product.availability, ProductAvailability.available);
      }
    });

    test('يقرأ كل حقول اللون، والفعّالة وحدها بترتيب sortOrder', () {
      final product = _variantProduct();
      expect(product.hasVariants, isTrue);
      expect(product.variants, hasLength(3));
      expect(product.activeVariants.map((v) => v.id), ['red', 'blue']);
      final red = product.activeVariants.first;
      expect(red.names.ar, 'أحمر');
      expect(red.names.ckb, 'سوور');
      expect(red.colorHex, '#E53935');
      expect(red.imageUrl, _redImage);
      expect(red.stock, 2);
      expect(red.inStock, isTrue);
      expect(product.activeVariants.last.inStock, isFalse);
      expect(product.activeVariantById('green'), isNull, reason: 'غير الفعّال لا يُختار');
      expect(product.copyWith(inFavorites: true).variants, hasLength(3));
    });

    test('الكردية الناقصة تسقط إلى العربية — كاسم المنتج', () {
      final blue = _variantProduct().activeVariants.last;
      expect(blue.names.ckb, isNull);
      expect(blue.nameIn(AppLanguage.kurdish), 'أزرق');
      final red = _variantProduct().activeVariants.first;
      expect(red.nameIn(AppLanguage.kurdish), 'سوور');
      expect(red.nameIn(AppLanguage.arabic), 'أحمر');
    });

    test('كل الألوان غير فعّالة ⇒ المنتج غير متوفر', () {
      final product = Product.fromJson(_productJson(variants: [
        _variantJson(id: 'x', ar: 'أسود', image: _redImage, stock: 4, active: false, sort: 0),
      ], stock: 4));
      expect(product.inStock, isFalse);
      expect(product.availability.canAddToCart, isFalse);
    });
  });

  group('لون السطر (سلة / تعديل مزامنة / طلب)', () {
    test('سطر السلة: الاسم من Ar/Ckb بلغة الواجهة، و`null` لسطرٍ بلا لون', () {
      final color = LineColor.fromLineJson(_colouredLineJson())!;
      expect(color.variantId, 'red');
      expect(color.nameIn(AppLanguage.arabic), 'أحمر');
      expect(color.nameIn(AppLanguage.kurdish), 'سوور');
      expect(color.colorHex, '#E53935');
      expect(LineColor.fromLineJson({'variantId': null, 'variantColorName': null}), isNull);
      final noCkb = LineColor.fromLineJson({..._colouredLineJson(), 'variantColorNameCkb': null})!;
      expect(noCkb.nameIn(AppLanguage.kurdish), 'أحمر');
    });

    test('تعديل المزامنة يحمل لونه', () {
      final adjustment = CartAdjustment.fromJson({
        'lineId': 'l1',
        'productId': 'p1',
        'reason': 'unavailable',
        'previousQuantity': 1,
        'quantity': 0,
        'variantId': 'red',
        'variantColorNameAr': 'أحمر',
        'variantColorNameCkb': null,
        'variantColorHex': null,
      });
      expect(adjustment.color?.nameIn(AppLanguage.kurdish), 'أحمر');
    });

    test('عنصر الطلب: لقطة اللون وصورته', () {
      final order = Order.fromJson({
        'id': 'o1',
        'status': 'PENDING_ADMIN_CONFIRMATION',
        'items': [
          {
            'productId': 'p1',
            'productNameAr': 'هودي ناروتو',
            'imageUrl': _redImage,
            'price': 25000,
            'quantity': 1,
            'lineTotal': 25000,
            'variantId': 'red',
            'variantColorName': 'أحمر',
            'variantColorNameAr': 'أحمر',
            'variantColorNameCkb': 'سوور',
            'variantColorHex': '#E53935',
          },
          {
            'productId': 'p2',
            'productNameAr': 'كوب',
            'price': 5000,
            'quantity': 1,
            'lineTotal': 5000,
          },
        ],
      });
      expect(order.items.first.color?.nameIn(AppLanguage.kurdish), 'سوور');
      expect(order.items.first.product.images, [_redImage]);
      expect(order.items.last.color, isNull);
    });
  });

  group('مستودع السلة على السلك', () {
    test('اللون يُرسَل `variantId`؛ المنتج القديم بلا المفتاح أصلاً', () async {
      final wire = _CartWire();
      final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))..httpClientAdapter = wire;
      final repo = CartRepositoryImpl(api: ApiClient(dio: dio));

      final lines = await repo.addToCart('p1', variantId: 'red', quantity: 2);
      expect(wire.lastBody?['variantId'], 'red');
      expect(wire.lastBody?['quantity'], 2);
      expect(lines.single.color?.variantId, 'red');
      expect(lines.single.product.images, [_redImage]);

      await repo.addToCart('p1');
      expect(wire.lastBody!.containsKey('variantId'), isFalse);
    });
  });

  // ═══ ٢ · صفحة المنتج ═══

  group('مُنتقي الألوان', () {
    testWidgets('الفعّالة وحدها تُعرض، ولا اختيار افتراضي: الإضافة معطَّلة حتى يُختار لون', (tester) async {
      await _pumpDetail(tester, _variantProduct());
      _drainImageErrors(tester);
      expect(find.text(AppStrings.arabic('productColor')), findsOneWidget);
      expect(_colour('red'), findsOneWidget);
      expect(_colour('blue'), findsOneWidget);
      expect(_colour('green'), findsNothing);
      expect(find.text('أخضر'), findsNothing);
      // المعرض الموحّد يبدأ بصورة أول لون — عرضها ليس اختياراً له.
      expect(_heroUrl(tester), _redImage);
      expect(find.byKey(const Key('product_selected_color_name')), findsNothing);
      expect(_addButton(tester).onPressed, isNull);
      expect(_addButton(tester).label, AppStrings.arabic('chooseColorFirst'));
      _drainImageErrors(tester);
    });

    testWidgets('اختيار لون يبدّل الصورة والتوفر، ويحدّ الكمية بمخزونه', (tester) async {
      await _pumpDetail(tester, _variantProduct());
      await _tap(tester, _colour('red'));
      _drainImageErrors(tester);

      expect(_heroUrl(tester), _redImage);
      expect(find.byKey(const Key('product_selected_color_name')), findsOneWidget);
      // مخزون الأحمر ٢ ⇒ «آخر ٢ قطع»، لا مجموع الألوان.
      final pill = tester.widget<ProductStockPill>(find.byKey(const Key('product_stock_pill')));
      expect(pill.stock, 2);
      expect(_addButton(tester).onPressed, isNotNull);

      final stepper = find.byType(OtakuQuantityStepper);
      expect(tester.widget<OtakuQuantityStepper>(stepper).canIncrease, isTrue);
      await _tap(tester, find.descendant(of: stepper, matching: find.byIcon(Icons.add_rounded)));
      expect(tester.widget<OtakuQuantityStepper>(stepper).quantity, 2);
      expect(tester.widget<OtakuQuantityStepper>(stepper).canIncrease, isFalse,
          reason: 'الكمية لا تتجاوز مخزون اللون المختار');
      _drainImageErrors(tester);
    });

    testWidgets('اللون النافد معطَّل لقارئ الشاشة ولا يُختار بالنقر', (tester) async {
      final semantics = tester.ensureSemantics();
      await _pumpDetail(tester, _variantProduct());
      _drainImageErrors(tester);

      expect(
        tester.getSemantics(_colour('blue')),
        isSemantics(
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
          label: 'أزرق${AppStrings.arabic('listSeparator')}${AppStrings.arabic('outOfStock')}',
        ),
      );
      expect(
        tester.getSemantics(_colour('red')),
        isSemantics(isButton: true, isEnabled: true, hasSelectedState: true, isSelected: false, label: 'أحمر'),
      );

      await _tap(tester, _colour('blue'));
      expect(_heroUrl(tester), _redImage, reason: 'النافد لا يُختار ولا ينقل المعرض');
      expect(find.byKey(const Key('product_selected_color_name')), findsNothing);
      expect(_addButton(tester).onPressed, isNull);

      await _tap(tester, _colour('red'));
      expect(tester.getSemantics(_colour('red')), isSemantics(isSelected: true));
      _drainImageErrors(tester);
      semantics.dispose();
    });

    testWidgets('الإضافة ترسل `variantId` اللون المختار', (tester) async {
      final (_, cart) = await _pumpDetail(tester, _variantProduct());
      await _tap(tester, _colour('red'));
      await _tap(tester, find.byKey(const Key('product_add_to_cart')));
      _drainImageErrors(tester);
      expect(cart.adds, hasLength(1));
      expect(cart.adds.single.productId, 'p1');
      expect(cart.adds.single.variantId, 'red');
      expect(cart.adds.single.quantity, 1);
      await tester.pump(const Duration(seconds: 5));
      _drainImageErrors(tester);
    });

    testWidgets('رفض اللون من الخادم: رسالته تُعرض والمنتج يُعاد جلبه', (tester) async {
      final (products, cart) = await _pumpDetail(tester, _variantProduct());
      cart.rejectWith = const AppException(
        'هذا اللون نفد من المخزون',
        statusCode: 409,
        code: 'VARIANT_OUT_OF_STOCK',
      );
      await _tap(tester, _colour('red'));
      // نفد الأحمر على الخادم منذ فُتحت الصفحة.
      products.detail = Product.fromJson(_productJson(variants: [
        _variantJson(id: 'red', ar: 'أحمر', hex: '#E53935', image: _redImage, stock: 0, sort: 0),
        _variantJson(id: 'blue', ar: 'أزرق', image: _blueImage, stock: 3, sort: 1),
      ], stock: 3));
      await _tap(tester, find.byKey(const Key('product_add_to_cart')));
      await tester.pump(const Duration(milliseconds: 100));
      _drainImageErrors(tester);

      expect(find.text('هذا اللون نفد من المخزون'), findsOneWidget);
      expect(products.fetches, 2);
      expect(find.byKey(const Key('product_selected_color_name')), findsNothing,
          reason: 'اللون النافد يسقط من الاختيار');
      expect(_addButton(tester).onPressed, isNull);
      await tester.pump(const Duration(seconds: 5));
      _drainImageErrors(tester);
    });

    testWidgets('الكردية: اسم اللون الكردي، والناقص بالعربية', (tester) async {
      await _pumpDetail(tester, _variantProduct(), language: AppLanguage.kurdish);
      _drainImageErrors(tester);
      expect(find.text(AppStrings.kurdish('productColor')), findsOneWidget);
      expect(find.descendant(of: _colour('red'), matching: find.text('سوور')), findsOneWidget);
      expect(find.descendant(of: _colour('blue'), matching: find.text('أزرق')), findsOneWidget);
      expect(_addButton(tester).label, AppStrings.kurdish('chooseColorFirst'));
    });

    testWidgets('منتجٌ قديم: لا قسم ألوان، والإضافة كما كانت بلا `variantId`', (tester) async {
      final (_, cart) = await _pumpDetail(tester, _legacyProduct());
      _drainImageErrors(tester);
      expect(find.text(AppStrings.arabic('productColor')), findsNothing);
      expect(find.byType(OtakuQuantityStepper), findsOneWidget);
      expect(_addButton(tester).onPressed, isNotNull);
      await _tap(tester, find.byKey(const Key('product_add_to_cart')));
      _drainImageErrors(tester);
      expect(cart.adds.single.variantId, isNull);
      await tester.pump(const Duration(seconds: 5));
      _drainImageErrors(tester);
    });
  });

  // ═══ ٣ · السلة والمراجعة والطلب ═══

  final colouredLine = CartItem(
    product: Product(id: 'p1', nameAr: 'هودي ناروتو', nameCkb: 'هودی ناروتۆ', price: 25000, images: const [], stock: 2),
    quantity: 1,
    lineId: 'l1',
    color: LineColor.fromLineJson(_colouredLineJson()),
  );
  final blueLine = CartItem(
    product: Product(id: 'p1', nameAr: 'هودي ناروتو', nameCkb: 'هودی ناروتۆ', price: 25000, images: const [], stock: 3),
    quantity: 1,
    lineId: 'l2',
    color: LineColor.fromLineJson({
      'variantId': 'blue',
      'variantColorNameAr': 'أزرق',
      'variantColorNameCkb': null,
      'variantColorHex': null,
    }),
  );
  const legacyLine = CartItem(
    product: Product(id: 'p2', nameAr: 'كوب', price: 5000, images: [], stock: 4),
    quantity: 1,
    lineId: 'l3',
  );

  group('عرض لون السطر', () {
    for (final language in AppLanguage.values) {
      testWidgets('${language.code}: السلة تعرض لوني المنتج سطرين، والقديم بلا لون', (tester) async {
        _phone(tester);
        final auth = stubAuthCubit(gender: 'male');
        await auth.loadSession();
        final cart = CartCubit(_RecordingCart([colouredLine, blueLine, legacyLine]));
        await cart.load();
        await tester.pumpWidget(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<CartCubit>.value(value: cart),
            ],
            child: _app(language: language, home: const Scaffold(body: CartScreen())),
          ),
        );
        await tester.pump();
        final strings = AppStrings.of(language);
        final red = language == AppLanguage.kurdish ? 'سوور' : 'أحمر';
        expect(find.text(strings.p('colorValue', {'color': red})), findsOneWidget);
        expect(find.text(strings.p('colorValue', {'color': 'أزرق'})), findsOneWidget);
        expect(find.byKey(const Key('line_color_label')), findsNWidgets(2));
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('المراجعة: لون كل سطر', (tester) async {
      _phone(tester);
      final cart = CartCubit(_RecordingCart());
      await tester.pumpWidget(
        MultiBlocProvider(
          providers: [
            BlocProvider<CartCubit>.value(value: cart),
            BlocProvider<AuthCubit>.value(value: stubAuthCubit()),
          ],
          child: _app(
            language: AppLanguage.arabic,
            home: OrderReviewScreen(
              orderData: OrderData(
                governorateId: 'g1',
                province: 'بغداد',
                deliveryCost: 5000,
                fullAddress: 'بغداد، الكرادة',
                phone: '07701234567',
                items: [colouredLine, legacyLine],
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text(AppStrings.arabic.p('colorValue', {'color': 'أحمر'})), findsOneWidget);
      expect(find.byKey(const Key('line_color_label')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pump(const Duration(seconds: 6));
    });

    testWidgets('تفاصيل الطلب: لقطة اللون بلغة الواجهة', (tester) async {
      _phone(tester);
      final order = Order.fromJson({
        'id': 'o1',
        'number': '1001',
        'status': 'PENDING_ADMIN_CONFIRMATION',
        'createdAt': '2026-10-27T10:00:00Z',
        'items': [
          {
            'productId': 'p1',
            'productNameAr': 'هودي ناروتو',
            'productNameCkb': 'هودی ناروتۆ',
            'price': 25000,
            'quantity': 1,
            'lineTotal': 25000,
            'variantId': 'red',
            'variantColorName': 'أحمر',
            'variantColorNameAr': 'أحمر',
            'variantColorNameCkb': 'سوور',
            'variantColorHex': '#E53935',
          },
        ],
      });
      await tester.pumpWidget(
        RepositoryProvider<FetchOrderDetailsUsecase>.value(
          value: FetchOrderDetailsUsecase(_Orders(order)),
          child: BlocProvider<AuthCubit>.value(
            value: stubAuthCubit(),
            child: _app(language: AppLanguage.kurdish, home: const OrderDetailScreen(orderId: 'o1')),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text(AppStrings.kurdish.p('colorValue', {'color': 'سوور'})), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  // STEP 77 (090): نظام الخيارات نفسه يمثّل تصميماً أو مقاساً، والنوع يسمّي
  // المحدّد والسطر — لا «اللون» لحقيبةٍ بتصميمين.
  group('نوع الخيارات', () {
    test('يُقرأ النوع، والغائب أو المجهول لون كما كان', () {
      expect(Product.fromJson(_productJson(variants: _threeColours())).variantKind, VariantKind.color);
      expect(
        Product.fromJson({..._productJson(variants: _threeColours()), 'variantKind': 'design'}).variantKind,
        VariantKind.design,
      );
      expect(VariantKind.parse('size'), VariantKind.size);
      expect(VariantKind.parse('flavour'), VariantKind.color);
      expect(LineColor.fromLineJson({..._colouredLineJson(), 'variantKind': 'size'})!.kind, VariantKind.size);
      expect(LineColor.fromLineJson(_colouredLineJson())!.kind, VariantKind.color);
    });

    for (final language in AppLanguage.values) {
      testWidgets('${language.code}: منتج تصميمات — العنوان وزرّ الإضافة بالتصميم', (tester) async {
        final product = Product.fromJson({..._productJson(variants: _threeColours()), 'variantKind': 'design'});
        await _pumpDetail(tester, product, language: language);
        _drainImageErrors(tester);
        final strings = AppStrings.of(language);
        expect(find.text(strings('productDesign')), findsOneWidget);
        expect(find.text(strings('productColor')), findsNothing);
        expect(_addButton(tester).label, strings('chooseDesignFirst'));
        _drainImageErrors(tester);
      });

      testWidgets('${language.code}: سطر خيار مقاس يُسمّى بالمقاس', (tester) async {
        final color = LineColor.fromLineJson({..._colouredLineJson(), 'variantKind': 'size'})!;
        await tester.pumpWidget(
          _app(language: language, home: Scaffold(body: LineColorLabel(color: color))),
        );
        final strings = AppStrings.of(language);
        final red = language == AppLanguage.kurdish ? 'سوور' : 'أحمر';
        expect(find.text(strings.p('sizeValue', {'color': red})), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  });
}
