// معرض صور المنتج العادية في صفحة المنتج (إصلاح ما بعد نشر Staging c7bdff0).
//
// كانت الفتحة تعرض `images.first` وحدها ونقاطاً ثابتةً (الأولى نشطة أبداً)،
// فلا سحب ولا انتقال إلى بقية الصور التي رفعها المسؤول. يُقاس هنا: الصورة
// الأولى افتراضاً، السحب في الاتجاهين بحدّي الأولى والأخيرة، لمس النقطة،
// تزامن النقطة النشطة والصورة، الترتيب كما أرسله الخادم، منتج بصورة واحدة
// أو بلا صور، والصورة التي يفشل تحميلها. ومع الألوان (STEP 74): صورة اللون
// المختار تتقدّم المعرض وتبقى صور المنتج بعدها، فلا يلتبس هذا بذاك.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
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

List<Object?> _colours() => [
  {
    'id': 'red',
    'colorName': 'أحمر',
    'colorNameAr': 'أحمر',
    'colorHex': '#E53935',
    'imageUrl': _redImage,
    'stock': 2,
    'isActive': true,
    'sortOrder': 0,
  },
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
  @override
  Future<List<CartItem>> fetchCart() async => const [];
  @override
  Future<CartSnapshot> syncCart() async => const CartSnapshot(items: []);
  @override
  Future<List<CartItem>> addToCart(String productId, {String? optionValue, String? variantId, int quantity = 1}) async =>
      const [];
  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async => const [];
  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => const [];
}

// ═══════════════════════ حوامل العرض ═══════════════════════

Future<void> _pumpDetail(WidgetTester tester, Map<String, dynamic> json) async {
  tester.view.physicalSize = const Size(412, 2200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final product = Product.fromJson(json);
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
          BlocProvider<CartCubit>(create: (_) => CartCubit(_EmptyCart())),
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

    testWidgets('اللون المختار يتقدّم المعرض وتبقى صور المنتج بعده بترتيبها', (tester) async {
      await _pumpDetail(tester, _productJson(variants: _colours()));
      expect(_heroUrl(tester), _images[0], reason: 'قبل الاختيار: صور المنتج وحدها');

      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[1]);

      final red = find.byKey(const Key('color_option_red'));
      await tester.ensureVisible(red);
      await tester.pump();
      await tester.tap(red, warnIfMissed: false);
      await tester.pumpAndSettle();
      _drainImageErrors(tester);

      // الاختيار يعيد المعرض إلى صورة اللون، وصور المنتج تليها.
      await tester.ensureVisible(_gallery);
      await tester.pumpAndSettle();
      expect(_heroUrl(tester), _redImage);
      expect(_activeDot(tester, 4), 0);
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[0]);
      await _swipeNext(tester);
      await _swipeNext(tester);
      expect(_heroUrl(tester), _images[2]);
      expect(_activeDot(tester, 4), 3);
    });
  });
}
