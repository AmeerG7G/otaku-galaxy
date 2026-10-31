// معرض صور المنتج العادية في صفحة المنتج (إصلاح ما بعد نشر Staging c7bdff0).
//
// كانت الفتحة تعرض `images.first` وحدها ونقاطاً ثابتةً (الأولى نشطة أبداً)،
// فلا سحب ولا انتقال إلى بقية الصور التي رفعها المسؤول. يُقاس هنا: الصورة
// الأولى افتراضاً، السحب في الاتجاهين بحدّي الأولى والأخيرة، لمس النقطة،
// تزامن النقطة النشطة والصورة، الترتيب كما أرسله الخادم، منتج بصورة واحدة
// أو بلا صور، والصورة التي يفشل تحميلها.
//
// المعرض الموحّد (STEP 74 + إصلاح ما بعد Staging 51eae0b): صورة كل لون ثم صور
// المنتج العامة بلا تكرار؛ تصفّحه لا يختار لوناً واختيار اللون ينقله إلى صورته؛
// وكل صوره تُطلب في العرض الأول مرةً واحدة — كانت صورة اللون لا تُطلب إلا لحظة
// اختياره، وبقية الصور لا تُطلب إلا لحظة السحب إليها.

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show SynchronousFuture;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/bilingual_text.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/widgets/product_image_gallery.dart';
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

// ترتيبٌ غير أبجدي عمداً — يُقاس أن المعرض يتبع ترتيب الخادم لا غيره.
const _images = [
  'https://cdn.test/front.png',
  'https://cdn.test/back.png',
  'https://cdn.test/detail.png',
];
const _redImage = 'https://cdn.test/red.png';

Map<String, dynamic> _productJson({
  List<Object?> images = _images,
  List<Object?>? variants,
}) => {
  'id': 'p1',
  'nameAr': 'هودي ناروتو',
  'descriptionAr': 'وصف',
  'price': 25000,
  'images': images,
  'stock': 4,
  'variants': ?variants,
};

const _blueImage = 'https://cdn.test/blue.png';

Map<String, Object?> _colour(
  String id,
  String image, {
  int sort = 0,
  int stock = 2,
  bool active = true,
}) => {
  'id': id,
  'colorName': id,
  'colorNameAr': id,
  'colorHex': '#E53935',
  'imageUrl': image,
  'stock': stock,
  'isActive': active,
  'sortOrder': sort,
};

/// أزرق قبل أحمر في القائمة وبعده في `sortOrder` — يُقاس الترتيب بالثاني.
List<Object?> _colours() => [
  _colour('blue', _blueImage, sort: 1, stock: 3),
  _colour('red', _redImage),
];

// ═══════════════════════ بدائل الطبقة السفلى ═══════════════════════

class _Products implements ProductRepository {
  _Products(this.detail);

  final Product detail;

  @override
  Future<Product> fetchProductDetails(String id) async => detail;
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

class _EmptyCart implements CartRepository {
  final adds = <({String productId, String? variantId})>[];

  @override
  Future<List<CartItem>> fetchCart() async => const [];
  @override
  Future<CartSnapshot> syncCart() async => const CartSnapshot(items: []);
  @override
  Future<List<CartItem>> addToCart(String productId, {String? optionValue, String? variantId, int quantity = 1}) async {
    adds.add((productId: productId, variantId: variantId));
    return const [];
  }
  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async => const [];
  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => const [];
}

// ═══════════════════════ حوامل العرض ═══════════════════════

Future<_EmptyCart> _pumpDetail(WidgetTester tester, Map<String, dynamic> json) async {
  tester.view.physicalSize = const Size(412, 2200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final product = Product.fromJson(json);
  final cart = _EmptyCart();
  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<FetchProductDetailsUsecase>.value(
          value: FetchProductDetailsUsecase(_Products(product)),
        ),
        RepositoryProvider<ReviewRepository>.value(value: _NoReviews()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<CartCubit>(create: (_) => CartCubit(cart)),
        ],
        child: MaterialApp(
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
          home: ProductDetailScreen(productId: product.id),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  _drainImageErrors(tester);
  return cart;
}

String? _heroUrl(WidgetTester tester) => tester
    .widget<ProductPhotoSlot>(find.byKey(const Key('product_hero_image')))
    .imageUrl;

final _gallery = find.byKey(const Key('product_gallery'));

Finder _dot(int i) => find.byKey(Key('product_gallery_dot_$i'));

/// النقطة النشطة هي الأعرض (١٨ مقابل ٦) — كما في النموذج.
int _activeDot(WidgetTester tester, int count) {
  final active = [
    for (var i = 0; i < count; i++)
      if (tester.getSize(_dot(i)).width > 6) i,
  ];
  expect(active, hasLength(1), reason: 'نقطةٌ نشطة واحدة بالضبط');
  return active.single;
}

/// سحبٌ نحو الصورة التالية. الواجهة RTL: التالية تأتي من اليسار، فالإصبع
/// يتحرّك يميناً.
Future<void> _swipeNext(WidgetTester tester) async {
  await tester.fling(_gallery, const Offset(300, 0), 1500);
  await tester.pumpAndSettle();
  _drainImageErrors(tester);
}

Future<void> _swipePrevious(WidgetTester tester) async {
  await tester.fling(_gallery, const Offset(-300, 0), 1500);
  await tester.pumpAndSettle();
  _drainImageErrors(tester);
}

/// صور الشبكة تفشل في بيئة الاختبار (HTTP 400) وتُعرض بديلاتها — وهذا بعينه
/// حالة «فشل التحميل لا يُسقط الصفحة».
void _drainImageErrors(WidgetTester tester) {
  Object? error;
  while ((error = tester.takeException()) != null) {
    if (error is! NetworkImageLoadException) throw error!;
  }
}


// ═══════════════════════ تسجيل طلبات الصور ═══════════════════════

/// عميل HTTP يسجّل كل رابط صورة يُطلب ولا يجيب أبداً — فتبقى الصورة «قيد
/// التحميل» ويُقاس **متى** طُلبت وكم مرة، لا كيف رُسمت.
class _RecordingHttpClient implements HttpClient {
  final requested = <String>[];

  @override
  Future<HttpClientRequest> getUrl(Uri url) {
    requested.add(url.toString());
    return Completer<HttpClientRequest>().future;
  }

  @override
  bool autoUncompress = false;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// يشغّل [body] وكل صور الشبكة تمرّ بعميلٍ مسجِّل. المتغيّر يُعاد قبل نهاية
/// الاختبار نفسه — الإطار يتحقّق من متغيّرات الرسم قبل `tearDown`.
Future<void> _withRecordedImages(
  WidgetTester tester,
  Future<void> Function(_RecordingHttpClient http) body,
) async {
  final client = _RecordingHttpClient();
  imageCache
    ..clear()
    ..clearLiveImages();
  debugNetworkImageHttpClientProvider = () => client;
  try {
    await body(client);
  } finally {
    // الصفحة تُهدم أولاً فلا تبقى صورةٌ معلّقة في الذاكرة لاختبارٍ تالٍ.
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
    imageCache
      ..clear()
      ..clearLiveImages();
  }
}

ProductVariant _variant(String id, String? image, {int sort = 0}) => ProductVariant(
  id: id,
  names: BilingualText(ar: id),
  imageUrl: image,
  stock: 1,
  sortOrder: sort,
);

Future<void> _selectColour(WidgetTester tester, String id) async {
  final chip = find.byKey(Key('color_option_$id'));
  await tester.ensureVisible(chip);
  await tester.pump();
  await tester.tap(chip, warnIfMissed: false);
  await tester.pumpAndSettle();
  _drainImageErrors(tester);
  await tester.ensureVisible(_gallery);
  await tester.pumpAndSettle();
}

final _selectedColourName = find.byKey(const Key('product_selected_color_name'));

void main() {
  setUpAll(loadProjectFonts);

  group('معرض صور المنتج', () {
    testWidgets('الصورة الأولى افتراضاً، ونقطةٌ لكل صورة والأولى نشطة', (tester) async {
      await _pumpDetail(tester, _productJson());
      expect(_heroUrl(tester), _images[0]);
      for (var i = 0; i < _images.length; i++) {
        expect(_dot(i), findsOneWidget);
      }
      expect(_dot(_images.length), findsNothing);
      expect(_activeDot(tester, _images.length), 0);
    });

    testWidgets('السحب يتنقّل بالترتيب ويقف عند الأخيرة ثم يعود حتى الأولى', (tester) async {
      await _pumpDetail(tester, _productJson());

      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[1]);
      expect(_activeDot(tester, 3), 1);

      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[2]);
      expect(_activeDot(tester, 3), 2);

      // الأخيرة حدٌّ — لا التفاف إلى الأولى.
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[2]);
      expect(_activeDot(tester, 3), 2);

      await _swipePrevious(tester);
      expect(_heroUrl(tester), _images[1]);
      expect(_activeDot(tester, 3), 1);

      await _swipePrevious(tester);
      await _swipePrevious(tester);
      expect(_heroUrl(tester), _images[0], reason: 'الأولى حدٌّ كذلك');
      expect(_activeDot(tester, 3), 0);
    });

    testWidgets('لمس نقطةٍ يعرض صورتها', (tester) async {
      await _pumpDetail(tester, _productJson());
      await tester.tap(_dot(2));
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_heroUrl(tester), _images[2]);
      expect(_activeDot(tester, 3), 2);

      await tester.tap(_dot(0));
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_heroUrl(tester), _images[0]);
      expect(_activeDot(tester, 3), 0);
    });

    testWidgets('منتجٌ بصورةٍ واحدة: تُعرض ولا نقاط ولا سحب يغيّرها', (tester) async {
      await _pumpDetail(tester, _productJson(images: [_images[1]]));
      expect(_heroUrl(tester), _images[1]);
      expect(_dot(0), findsNothing);
      expect(_gallery, findsNothing, reason: 'لا معرض قابل للسحب لصورة واحدة');
      await tester.fling(find.byKey(const Key('product_hero_image')), const Offset(300, 0), 1500);
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_heroUrl(tester), _images[1]);
    });

    testWidgets('منتجٌ بلا صور: البديل المحايد كما كان، بلا نقاط', (tester) async {
      await _pumpDetail(tester, _productJson(images: const []));
      expect(_heroUrl(tester), isNull);
      expect(find.text(AppStrings.arabic('productPhoto')), findsOneWidget);
      expect(_dot(0), findsNothing);
    });

    testWidgets('صورةٌ يفشل تحميلها تُعرض بالبديل والتنقّل باقٍ', (tester) async {
      // كل صور الشبكة تفشل هنا (٤٠٠) — الصفحة لا تسقط وتبقى قابلة للتنقّل.
      await _pumpDetail(tester, _productJson());
      expect(find.text(AppStrings.arabic('productPhoto')), findsOneWidget);
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[1]);
      expect(find.text(AppStrings.arabic('productPhoto')), findsOneWidget);
    });
  });

  group('ترتيب المعرض الموحّد', () {
    test('صورة كل لون بترتيب الألوان، ثم الصور العامة بترتيبها', () {
      expect(
        productGalleryImages(_images, colours: [_variant('red', _redImage), _variant('blue', _blueImage, sort: 1)]),
        [_redImage, _blueImage, ..._images],
      );
    });

    test('صورةٌ هي صورة لونٍ ومرفوعةٌ عامةً أيضاً تظهر مرةً واحدة في موضع اللون', () {
      expect(
        productGalleryImages([_images[0], _blueImage, _images[1], _images[0]], colours: [_variant('blue', _blueImage)]),
        [_blueImage, _images[0], _images[1]],
      );
    });

    test('لونان بالصورة نفسها: مرةً واحدة', () {
      expect(
        productGalleryImages(const [], colours: [_variant('a', _redImage), _variant('b', _redImage, sort: 1)]),
        [_redImage],
      );
    });

    test('لونٌ بلا صورة، ورابطٌ فارغ أو بمسافات: يسقطان بلا خطأ', () {
      expect(
        productGalleryImages(['', '  ', ' ${_images[1]} '], colours: [_variant('a', null), _variant('b', '  ')]),
        [_images[1]],
      );
      expect(productGalleryImages(const [], colours: [_variant('a', null)]), isEmpty);
    });

    test('ترتيبٌ ثابت: المدخلات نفسها ⇒ المعرض نفسه، بلا ألوان ⇒ الصور العامة كما هي', () {
      final colours = [_variant('red', _redImage), _variant('blue', _blueImage, sort: 1)];
      expect(productGalleryImages(_images, colours: colours), productGalleryImages(_images, colours: colours));
      expect(productGalleryImages(_images), _images);
    });

    test('صورة البطاقة: أولى الصور العامة كما كانت، وإلا صورة أول لونٍ فعّال', () {
      expect(Product.fromJson(_productJson(variants: _colours())).coverImage, _images[0]);
      expect(Product.fromJson(_productJson(images: const [], variants: _colours())).coverImage, _redImage);
      expect(
        Product.fromJson(_productJson(images: const [], variants: [
          _colour('red', _redImage, active: false),
          _colour('blue', _blueImage, sort: 1),
        ])).coverImage,
        _blueImage,
        reason: 'لونٌ غير فعّال لا يُعرض للزبون',
      );
      expect(Product.fromJson(_productJson(images: const [])).coverImage, isNull);
    });
  });

  group('المعرض الموحّد في صفحة المنتج', () {
    testWidgets('كل صور الألوان والصور العامة في معرضٍ واحد، بلا تكرار، وغير الفعّال خارجه', (tester) async {
      await _pumpDetail(tester, _productJson(
        // صورة الأحمر مرفوعةٌ عامةً أيضاً — تظهر مرةً واحدة.
        images: [_images[0], _redImage, _images[1]],
        variants: [
          ..._colours(),
          _colour('green', 'https://cdn.test/green.png', sort: 2, active: false),
        ],
      ));
      final expected = [_redImage, _blueImage, _images[0], _images[1]];
      for (var i = 0; i < expected.length; i++) {
        expect(_dot(i), findsOneWidget);
      }
      expect(_dot(expected.length), findsNothing);
      for (var i = 0; i < expected.length; i++) {
        expect(_heroUrl(tester), expected[i]);
        expect(_activeDot(tester, expected.length), i);
        await _swipeNext(tester);
      }
      expect(_heroUrl(tester), expected.last, reason: 'الأخيرة حدٌّ');
    });

    testWidgets('تصفّح المعرض لا يختار لوناً، والإضافة تبقى معطّلة', (tester) async {
      final cart = await _pumpDetail(tester, _productJson(variants: _colours()));
      expect(_heroUrl(tester), _redImage);
      expect(_selectedColourName, findsNothing, reason: 'عرض صورة اللون ليس اختياراً له');
      await _swipeNext(tester);
      expect(_heroUrl(tester), _blueImage);
      await tester.tap(_dot(0));
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_selectedColourName, findsNothing);
      final add = find.byKey(const Key('product_add_to_cart'));
      await tester.ensureVisible(add);
      await tester.tap(add, warnIfMissed: false);
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(cart.adds, isEmpty, reason: 'لا لون يُرسَل لم يختره الزبون');
    });

    testWidgets('اختيار لون ينقل المعرض إلى صورته؛ التصفّح بعده لا يغيّر اللون المرسَل', (tester) async {
      final cart = await _pumpDetail(tester, _productJson(variants: _colours()));
      await _selectColour(tester, 'blue');
      expect(_heroUrl(tester), _blueImage);
      expect(_activeDot(tester, 5), 1);
      expect(tester.widget<Text>(_selectedColourName).data, 'blue');

      // يتصفّح إلى صورةٍ عامة وإلى صورة الأحمر — يبقى الأزرق مختاراً.
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[0]);
      await tester.tap(_dot(0));
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_heroUrl(tester), _redImage);
      expect(tester.widget<Text>(_selectedColourName).data, 'blue');

      // اختيار الأزرق مرةً ثانية يعيد المعرض إليه.
      await _selectColour(tester, 'blue');
      expect(_heroUrl(tester), _blueImage);

      await _selectColour(tester, 'red');
      expect(_heroUrl(tester), _redImage);
      expect(_activeDot(tester, 5), 0);
      await _swipeNext(tester);
      await _swipeNext(tester);

      final add = find.byKey(const Key('product_add_to_cart'));
      await tester.ensureVisible(add);
      await tester.tap(add, warnIfMissed: false);
      await tester.pump();
      await tester.pump(const Duration(seconds: 5));
      _drainImageErrors(tester);
      expect(cart.adds, [(productId: 'p1', variantId: 'red')]);
    });

    testWidgets('منتجٌ بألوانٍ بلا صورٍ عامة: صور الألوان وحدها', (tester) async {
      await _pumpDetail(tester, _productJson(images: const [], variants: _colours()));
      expect(_heroUrl(tester), _redImage);
      expect(_dot(1), findsOneWidget);
      expect(_dot(2), findsNothing);
    });

    testWidgets('لونٌ واحد بلا صورٍ عامة: صورةٌ واحدة بلا نقاط', (tester) async {
      await _pumpDetail(tester, _productJson(images: const [], variants: [_colour('red', _redImage)]));
      expect(_heroUrl(tester), _redImage);
      expect(_gallery, findsNothing);
      expect(_dot(0), findsNothing);
    });

    testWidgets('عشرون لوناً وعشر صور: النقاط لا تفيض عن الشاشة', (tester) async {
      await _pumpDetail(tester, _productJson(
        images: [for (var i = 0; i < 10; i++) 'https://cdn.test/g$i.png'],
        variants: [for (var i = 0; i < 20; i++) _colour('c$i', 'https://cdn.test/c$i.png', sort: i)],
      ));
      expect(_dot(29), findsOneWidget);
      expect(tester.takeException(), isNull, reason: 'لا RenderFlex overflow');
    });
  });

  group('تحميل صور المعرض', () {
    testWidgets('العرض الأول يطلب المعروضة وجارتها بلا لمس؛ القفزة لا تطلب ما بينهما؛ كل رابطٍ مرةً واحدة', (tester) async {
      await _withRecordedImages(tester, (http) async {
        // المعرض: [أحمر، أزرق، front، back، detail].
        await _pumpDetail(tester, _productJson(variants: _colours()));
        expect(_heroUrl(tester), _redImage);
        expect(http.requested.toSet(), {_redImage, _blueImage},
            reason: 'صورة اللون الأول تُطلب في العرض الأول، والتالية جاهزةٌ للسحب');

        // نقطةٌ بعيدة: قفزةٌ إلى الأخيرة — لا تُطلب الصورة التي في الطريق.
        await tester.tap(_dot(4));
        await tester.pumpAndSettle();
        _drainImageErrors(tester);
        expect(_heroUrl(tester), _images[2]);
        expect(http.requested, isNot(contains(_images[0])));
        expect(http.requested.toSet(), {_redImage, _blueImage, _images[1], _images[2]});

        // العودة سحباً حتى الأولى، ثم اختيار اللونين: لا طلب مكرّر.
        for (var i = 0; i < 4; i++) {
          await _swipePrevious(tester);
        }
        await _selectColour(tester, 'blue');
        await _selectColour(tester, 'red');
        expect(http.requested.toSet(), {_redImage, _blueImage, ..._images});
        expect(http.requested, hasLength(5), reason: 'لا طلبٌ مكرّر لرابطٍ واحد');
      });
    });

    testWidgets('اختيار لونٍ بعيد يقفز إلى صورته — ولا يطلب صور الألوان التي بينهما', (tester) async {
      await _withRecordedImages(tester, (http) async {
        final colours = [for (var i = 0; i < 6; i++) _colour('c$i', 'https://cdn.test/c$i.png', sort: i)];
        await _pumpDetail(tester, _productJson(variants: colours));
        await _selectColour(tester, 'c5');
        expect(_heroUrl(tester), 'https://cdn.test/c5.png');
        expect(_activeDot(tester, 9), 5);
        for (final skipped in ['c2', 'c3']) {
          expect(http.requested, isNot(contains('https://cdn.test/$skipped.png')));
        }
      });
    });

    testWidgets('قيد التحميل: الفتحة تعرض البديل المحايد بلا تسمية، لا فراغاً ولا خطأ', (tester) async {
      await _withRecordedImages(tester, (http) async {
        await _pumpDetail(tester, _productJson());
        final hero = find.byKey(const Key('product_hero_image'));
        expect(find.descendant(of: hero, matching: find.byIcon(Icons.image_outlined)), findsOneWidget);
        expect(find.descendant(of: hero, matching: find.text(AppStrings.arabic('productPhoto'))), findsNothing);
        expect(tester.takeException(), isNull);
      });
    });

    testWidgets('صورةٌ محمّلة (ما يتركه التحميل المسبق) تُرسم في الإطار الأول بلا بديل', (tester) async {
      await _withRecordedImages(tester, (http) async {
        final image = (await tester.runAsync(() => createTestImage(width: 2, height: 2)))!;
        imageCache.putIfAbsent(
          NetworkImage(_images[0]),
          () => OneFrameImageStreamCompleter(SynchronousFuture(ImageInfo(image: image))),
        );
        await _pumpDetail(tester, _productJson());
        final hero = find.byKey(const Key('product_hero_image'));
        final raw = tester.widget<RawImage>(find.descendant(of: hero, matching: find.byType(RawImage)));
        expect(raw.image, isNotNull);
        expect(find.descendant(of: hero, matching: find.byIcon(Icons.image_outlined)), findsNothing);
        expect(http.requested, isNot(contains(_images[0])), reason: 'المحمّلة لا تُطلب ثانية');
      });
    });

    testWidgets('إعادة البناء بقائمةٍ أخرى لا تُبقي صورةً قديمة', (tester) async {
      Widget gallery(List<String> images) => MaterialApp(
        theme: AppTheme.light,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: SizedBox(height: 330, child: ProductImageGallery(images: images)),
        ),
      );
      await tester.pumpWidget(gallery(_images));
      await _swipeNext(tester);
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[2]);

      // إعادة جلبٍ بصورتين أخريين: النقطة والصورة داخل القائمة الجديدة.
      const fresh = ['https://cdn.test/x.png', 'https://cdn.test/y.png'];
      await tester.pumpWidget(gallery(fresh));
      await tester.pumpAndSettle();
      _drainImageErrors(tester);
      expect(_heroUrl(tester), fresh[1]);
      expect(_activeDot(tester, 2), 1);
      expect(find.byWidgetPredicate((w) => w is ProductPhotoSlot && w.imageUrl == _images[2]), findsNothing);
    });
  });
}
