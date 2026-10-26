// منطقة عرض التوصيل المميّز في صفحة المنتج.
//
// الصفحة كانت تقول «هذا المنتج ضمن عرض التوصيل المميّز» ولا تقول كم. المبلغ
// يُعرض الآن تحته في المنطقة نفسها، وبالنصّ نفسه الذي تعرضه بطاقة المنتج.
//
// [CRITICAL] الأهلية والمبلغ من الخادم (`hasDeliveryPromo` /
// `deliveryPromoAmount`)؛ لذا يستعمل الاختبار مبلغاً غير ١٠٠٠ أيضاً — لو
// كُتب ١٠٠٠ في الواجهة لسقط.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
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

const _promoAr = 'هذا المنتج ضمن عرض التوصيل المميّز';

Product _product({bool promo = true, double amount = 1000}) => Product(
  id: 'p1',
  nameAr: 'مجسم لوفي',
  nameCkb: 'پەیکەری لوفی',
  descriptionAr: 'وصف',
  descriptionCkb: 'وەسف',
  price: 25000,
  images: const [],
  stock: 5,
  categoryId: 'c1',
  hasDeliveryPromo: promo,
  deliveryPromoAmount: promo ? amount : 0,
);

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

Future<void> _pumpDetail(
  WidgetTester tester,
  Product product, {
  AppLanguage language = AppLanguage.arabic,
  double width = 412,
}) async {
  tester.view.physicalSize = Size(width, 915);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final auth = stubAuthCubit(gender: 'male');
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
            language: language,
            child: child ?? const SizedBox.shrink(),
          ),
          home: ProductDetailScreen(productId: product.id),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(loadProjectFonts);

  group('منطقة عرض التوصيل المميّز في صفحة المنتج', () {
    testWidgets('منتج ضمن العرض: الرسالة القائمة ومبلغ الخصم معاً', (tester) async {
      await _pumpDetail(tester, _product());

      expect(find.text(_promoAr), findsOneWidget);
      expect(find.text('خصم 1000 د.ع من التوصيل'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('[CRITICAL] المبلغ من الخادم لا من الواجهة', (tester) async {
      await _pumpDetail(tester, _product(amount: 2500));

      expect(find.text(_promoAr), findsOneWidget);
      expect(find.text('خصم 2500 د.ع من التوصيل'), findsOneWidget);
      expect(find.textContaining('1000'), findsNothing);
    });

    testWidgets('منتج خارج العرض: لا رسالة ولا مبلغ', (tester) async {
      await _pumpDetail(tester, _product(promo: false));

      expect(find.text(_promoAr), findsNothing);
      expect(find.textContaining('من التوصيل'), findsNothing);
      expect(find.text('🚚'), findsNothing);
    });

    testWidgets('RTL: السطران تحت بعضهما، والأيقونة في جهة البداية (اليمين)', (tester) async {
      await _pumpDetail(tester, _product());

      final promo = find.text(_promoAr);
      final amount = find.text('خصم 1000 د.ع من التوصيل');
      final truck = find.text('🚚');

      expect(Directionality.of(tester.element(promo)), TextDirection.rtl);
      // المبلغ تحت الرسالة مباشرة، ومحاذاتهما لجهة البداية نفسها.
      expect(tester.getTopLeft(amount).dy, greaterThan(tester.getBottomLeft(promo).dy - 0.5));
      expect(tester.getTopRight(amount).dx, closeTo(tester.getTopRight(promo).dx, 0.5));
      // الأيقونة يمين النصّين.
      expect(tester.getCenter(truck).dx, greaterThan(tester.getTopRight(promo).dx));
    });

    testWidgets('شاشة ضيّقة (320): لا فيضان ولا قصّ — النصّ يلتفّ كاملاً', (tester) async {
      await _pumpDetail(tester, _product(amount: 12500), width: 320);

      expect(tester.takeException(), isNull);
      for (final text in [_promoAr, 'خصم 12500 د.ع من التوصيل']) {
        final widget = tester.widget<Text>(find.text(text));
        expect(widget.maxLines, isNull, reason: 'سطر العرض لا يُقصّ');
        expect(widget.overflow, isNull);
        // داخل عرض الشاشة.
        expect(tester.getTopLeft(find.text(text)).dx, greaterThanOrEqualTo(0));
        expect(tester.getTopRight(find.text(text)).dx, lessThanOrEqualTo(320));
      }
    });

    testWidgets('الكردية: السطران بترجمتهما', (tester) async {
      await _pumpDetail(tester, _product(), language: AppLanguage.kurdish);

      expect(find.text(AppStrings.kurdish('deliveryPromoProduct')), findsOneWidget);
      expect(find.text('داشکاندنی 1000 د.ع لە گەیاندن'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  testWidgets('البطاقة والصفحة تعرضان نصّ المبلغ نفسه', (tester) async {
    final product = _product(amount: 1500);
    await tester.pumpWidget(
      MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: Center(
              child: SizedBox(width: 200, child: AnimeProductCard(product: product)),
            ),
          ),
        ),
      ),
    );
    expect(find.text('خصم 1500 د.ع من التوصيل'), findsOneWidget);
  });
}
