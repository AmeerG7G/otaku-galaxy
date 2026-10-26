// تبديل الأقسام لا يعرض قائمةً قديمة.
//
// [CRITICAL REGRESSION GUARD] الجذر: كل شاشةٍ تُعيد الجلب في موضعها
// (منتجات القسم عند تغيير الترتيب، معرض المجتمع عند تبديل رقاقة القسم،
// البحث عند تغيّر النصّ) كانت تكتب **أيّ** ردٍّ يصل في الحالة — ولو كان
// لطلبٍ سابق تجاوزه المستخدم. فيصل ردّ «أ» بعد ردّ «ب» فتظهر منتجات «أ»
// والترويسة تقول «ب»، ثم «يتصحّح» الوضع مع ردٍّ لاحق: هذا هو الوميض. والحلّ
// رقمٌ تسلسلي للطلب (`RequestSequence`): الردّ الذي لا يحمل أحدث رقمٍ يُهمَل.
//
// وعطبٌ ثانٍ على المسار نفسه: بعد إعادة الجلب كانت الرقاقة تعود إلى الصفحة
// الأولى بينما `PageController` باقٍ على صفحته — فالرقاقة المضاءة تقول قسماً
// والمنتجات المعروضة من غيره.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:otaku_galaxy/core/l10n/bilingual_text.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/utils/request_sequence.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/category_products_screen.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_category_products_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/search_products_usecase.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/community/presentation/screens/community_screen.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/search/data/search_history_storage.dart';
import 'package:otaku_galaxy/features/search/presentation/screens/search_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

Product _product(String id, String name, {String? subcategoryId}) => Product(
  id: id,
  nameAr: name,
  price: 1000,
  descriptionAr: '',
  images: const [],
  categoryId: 'c1',
  subcategoryId: subcategoryId,
);

const _category = Category(
  id: 'c1',
  name: 'قرطاسية',
  subcategories: ['دفاتر', 'أقلام', 'ملصقات'],
  subcategoryIds: {'دفاتر': 's1', 'أقلام': 's2', 'ملصقات': 's3'},
);

/// مستودعٌ يتحكّم الاختبار في لحظة اكتمال كل طلب — لا في ترتيبه.
class _Repo implements ProductRepository {
  _Repo({this.categories = const [_category]});
  final List<Category> categories;
  final List<Completer<List<Product>>> categoryRequests = [];
  final List<ProductSort?> sorts = [];
  final List<Completer<ProductPage>> searchRequests = [];
  final List<String> queries = [];

  @override
  Future<List<Category>> fetchCategories() async => categories;

  @override
  Future<List<Product>> fetchCategoryProducts(String categoryId, {ProductSort? sort}) {
    final completer = Completer<List<Product>>();
    categoryRequests.add(completer);
    sorts.add(sort);
    return completer.future;
  }

  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20, ProductSort? sort}) {
    final completer = Completer<ProductPage>();
    searchRequests.add(completer);
    queries.add(query);
    return completer.future;
  }

  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({int page = 1, int limit = 20, String? categoryId, String? subcategoryId}) async =>
      const ProductPage(items: [], hasMore: false);
  @override
  Future<Product> fetchProductDetails(String id) async => throw UnimplementedError();
}

/// مستودع تقييمات يتحكّم الاختبار في اكتمال طلبات المعرض.
class _Reviews implements ReviewRepository {
  final List<Completer<List<Review>>> galleryRequests = [];
  final List<String?> categoryIds = [];

  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) {
    final completer = Completer<List<Review>>();
    galleryRequests.add(completer);
    categoryIds.add(categoryId);
    return completer.future;
  }

  @override
  Future<List<Review>> fetchMyReviews() async => const [];
  @override
  Future<Review?> findReview({required String orderId, required String productId}) async => null;
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async => const [];
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

Review _photo(String id, String product) => Review(
  id: id,
  productId: 'p-$id',
  productNames: BilingualText(ar: product),
  orderId: 'o1',
  rating: 5,
  comment: 'رائع',
  photoUrls: const ['/uploads/review/x.png'],
  status: ReviewStatus.approved,
  customerName: 'زبون',
  createdAt: DateTime(2026, 9, 1),
);

Widget _app(
  _Repo repo,
  Widget home, {
  LocaleCubit? locale,
  _Reviews? reviews,
}) => MultiRepositoryProvider(
  providers: [
    RepositoryProvider.value(value: FetchCategoryProductsUsecase(repo)),
    RepositoryProvider.value(value: FetchCategoriesUsecase(repo)),
    RepositoryProvider.value(value: SearchProductsUsecase(repo)),
    RepositoryProvider<ReviewRepository>.value(value: reviews ?? _Reviews()),
  ],
  child: MultiBlocProvider(
    providers: [
      BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
      if (locale != null) BlocProvider<LocaleCubit>.value(value: locale),
      BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
      BlocProvider<ReviewsCubit>(create: (context) => ReviewsCubit(context.read<ReviewRepository>())),
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
      home: home,
    ),
  ),
);

void main() {
  setUpAll(loadProjectFonts);

  test('RequestSequence: أحدث رقمٍ وحده هو الجاري', () {
    final seq = RequestSequence();
    final first = seq.next();
    expect(seq.isCurrent(first), isTrue);
    final second = seq.next();
    expect(seq.isCurrent(first), isFalse);
    expect(seq.isCurrent(second), isTrue);
  });

  group('منتجات القسم', () {
    /// يفتح ورقة الترتيب ويختار خياراً — كما يفعل المستخدم؛ الشاشة تعيد
    /// الجلب فور الاختيار ولا تنتظر الردّ (تبقى الورقة مغلقة والطلب معلّقاً).
    Future<void> pickSort(WidgetTester tester, String label) async {
      await tester.tap(find.byType(OtakuSortBar));
      await tester.pumpAndSettle();
      await tester.tap(find.text(label).last);
      // إغلاق الورقة وبدء الجلب — بلا `pumpAndSettle`: الطلب معلّق عمداً.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }

    Future<_Repo> pump(WidgetTester tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final repo = _Repo();
      await tester.pumpWidget(
        _app(repo, const CategoryProductsScreen(categoryId: 'c1', categoryName: 'قرطاسية')),
      );
      await tester.pump();
      return repo;
    }

    testWidgets('[CRITICAL] ردُّ جلبٍ سابق يصل بعد اللاحق فلا يطمسه (إعادة الجلب بتبديل اللغة)', (tester) async {
      // شريط الترتيب يختفي أثناء التحميل، فلا يستطيع المستخدم إطلاق طلبين
      // متداخلين منه؛ المسار المتاح لإعادة الجلب في موضعها هو تبديل اللغة
      // (`LocaleRefetch`). السباق نفسه، والحارس نفسه.
      SharedPreferences.setMockInitialValues({});
      final locale = LocaleCubit(await SharedPreferences.getInstance());
      addTearDown(locale.close);
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final repo = _Repo();
      await tester.pumpWidget(
        _app(repo, const CategoryProductsScreen(categoryId: 'c1', categoryName: 'قرطاسية'), locale: locale),
      );
      await tester.pump();
      expect(repo.categoryRequests, hasLength(1));

      // الطلب الأول («أ») ما زال معلّقاً حين تتبدّل اللغة فيُطلق «ب».
      await locale.setLanguage(AppLanguage.kurdish);
      await tester.pump();
      expect(repo.categoryRequests, hasLength(2));

      // «ب» يصل أولاً ويُعرض.
      repo.categoryRequests[1].complete([_product('b', 'دفتر ب', subcategoryId: 's1')]);
      await tester.pumpAndSettle();
      expect(find.text('دفتر ب'), findsOneWidget);

      // ثم «أ» المتجاوَز يصل متأخّراً — يجب أن يُهمَل.
      repo.categoryRequests[0].complete([_product('a', 'دفتر أ متأخّر', subcategoryId: 's1')]);
      await tester.pumpAndSettle();
      expect(find.text('دفتر ب'), findsOneWidget, reason: 'الأحدث يبقى');
      expect(find.text('دفتر أ متأخّر'), findsNothing, reason: 'الردّ المتجاوَز لا يُعرض');
    });

    testWidgets('[CRITICAL] إعادة الجلب على الصفحة الثالثة تُبقي الرقاقة والصفحة معاً', (tester) async {
      final repo = await pump(tester);
      repo.categoryRequests[0].complete([
        _product('n', 'دفتر', subcategoryId: 's1'),
        _product('p', 'قلم', subcategoryId: 's2'),
        _product('s', 'ملصق', subcategoryId: 's3'),
      ]);
      await tester.pumpAndSettle();

      await tester.tap(find.text('ملصقات'));
      await tester.pumpAndSettle();
      expect(find.text('ملصق'), findsOneWidget);
      expect(find.text('دفتر'), findsNothing);

      await pickSort(tester, 'السعر: من الأقل');
      repo.categoryRequests[1].complete([
        _product('n', 'دفتر', subcategoryId: 's1'),
        _product('p', 'قلم', subcategoryId: 's2'),
        _product('s', 'ملصق', subcategoryId: 's3'),
      ]);
      await tester.pumpAndSettle();

      // ما زلنا في «ملصقات»: الرقاقة مختارة والصفحة تعرض منتجاتها.
      final chip = tester.widget<AnimeChoiceChip>(
        find.ancestor(of: find.text('ملصقات'), matching: find.byType(AnimeChoiceChip)),
      );
      expect(chip.selected, isTrue);
      expect(find.text('ملصق'), findsOneWidget);
      expect(find.text('دفتر'), findsNothing, reason: 'لا رجوعٌ صامت إلى الصفحة الأولى');
    });
  });

  group('البحث', () {
    testWidgets('[CRITICAL] نتائج استعلامٍ سابق تصل بعد اللاحق فلا تُعرض', (tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      if (sl.isRegistered<SearchHistoryStorage>()) sl.unregister<SearchHistoryStorage>();
      sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
      addTearDown(() => sl.unregister<SearchHistoryStorage>());
      final repo = _Repo();
      await tester.pumpWidget(_app(repo, const SearchScreen()));
      await tester.pump();

      await tester.enterText(find.byType(TextField).first, 'ناروتو');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'لوفي');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      expect(repo.queries, ['ناروتو', 'لوفي']);

      repo.searchRequests[1].complete(ProductPage(items: [_product('l', 'قبعة لوفي')], hasMore: false));
      await tester.pumpAndSettle();
      expect(find.text('قبعة لوفي'), findsOneWidget);

      repo.searchRequests[0].complete(ProductPage(items: [_product('n', 'دفتر ناروتو')], hasMore: false));
      await tester.pumpAndSettle();
      expect(find.text('قبعة لوفي'), findsOneWidget);
      expect(find.text('دفتر ناروتو'), findsNothing);
    });
  });

  group('معرض المجتمع', () {
    testWidgets('[CRITICAL] تبديل رقاقة القسم: ردّ القسم السابق يصل بعد الجديد فلا يطمسه', (tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final repo = _Repo();
      final reviews = _Reviews();
      await tester.pumpWidget(_app(repo, const Scaffold(body: CommunityScreen()), reviews: reviews));
      await tester.pump();
      // الجلب الأول («الكل») يكتمل، فتظهر الرقائق والمعرض.
      expect(reviews.galleryRequests, hasLength(1));
      reviews.galleryRequests[0].complete([_photo('all', 'كل المنتجات')]);
      await tester.pumpAndSettle();

      // المستخدم يختار «قرطاسية» (طلب «أ») ثم يعود إلى «الكل» (طلب «ب») بسرعة.
      await tester.tap(find.text('قرطاسية').last);
      await tester.pump();
      await tester.tap(find.text('الكل').last);
      await tester.pump();
      expect(reviews.categoryIds.sublist(1), ['c1', null]);

      // «ب» يصل أولاً.
      reviews.galleryRequests[2].complete([_photo('b', 'منتج الكل')]);
      await tester.pumpAndSettle();
      expect(find.text('منتج الكل'), findsWidgets);

      // «أ» المتجاوَز يصل متأخّراً — لا يُعرض.
      reviews.galleryRequests[1].complete([_photo('a', 'منتج قرطاسية متأخّر')]);
      await tester.pumpAndSettle();
      expect(find.text('منتج الكل'), findsWidgets, reason: 'الأحدث يبقى');
      expect(find.text('منتج قرطاسية متأخّر'), findsNothing, reason: 'ردّ الرقاقة السابقة لا يُعرض');
    });

    testWidgets('[CRITICAL] تنقّلٌ سريع أ ← ب ← ج ← أ: الردود تصل بكل ترتيبٍ ممكن والمعروض دائماً للرقاقة المختارة', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      const b = Category(id: 'c2', name: 'ملابس');
      const c = Category(id: 'c3', name: 'الحقائب');
      final repo = _Repo(categories: const [_category, b, c]);
      final reviews = _Reviews();
      await tester.pumpWidget(_app(repo, const Scaffold(body: CommunityScreen()), reviews: reviews));
      await tester.pump();
      reviews.galleryRequests[0].complete([_photo('all', 'كل المنتجات')]);
      await tester.pumpAndSettle();

      // أ ← ب ← ج ← أ بلا انتظار: أربعة طلبات معلّقة، الأخير هو «أ» الثاني.
      for (final name in ['قرطاسية', 'ملابس', 'الحقائب', 'قرطاسية']) {
        await tester.tap(find.text(name).last);
        await tester.pump();
      }
      expect(reviews.categoryIds.sublist(1), ['c1', 'c2', 'c3', 'c1']);
      expect(reviews.galleryRequests, hasLength(5));

      // الردود تصل بترتيبٍ معاكس: ج، ثم ب، ثم أ الأول — ولا واحد منها يُعرض.
      // (الطلب الجاري ما يزال معلّقاً فمؤشّر التحميل يدور؛ يُدفع الإطار بمهلة
      // لا حتى السكون.)
      reviews.galleryRequests[3].complete([_photo('c', 'منتج الحقائب')]);
      await tester.pump(const Duration(milliseconds: 300));
      reviews.galleryRequests[2].complete([_photo('b', 'منتج ملابس')]);
      await tester.pump(const Duration(milliseconds: 300));
      reviews.galleryRequests[1].complete([_photo('a1', 'منتج قرطاسية القديم')]);
      await tester.pump(const Duration(milliseconds: 300));
      for (final stale in ['منتج الحقائب', 'منتج ملابس', 'منتج قرطاسية القديم']) {
        expect(find.text(stale), findsNothing, reason: 'ردٌّ متجاوَز لا يُعرض: $stale');
      }
      // الطلب الأخير وحده يُعرض حين يصل.
      reviews.galleryRequests[4].complete([_photo('a2', 'منتج قرطاسية الحالي')]);
      await tester.pumpAndSettle();
      expect(find.text('منتج قرطاسية الحالي'), findsWidgets);
      expect(find.text('منتج الحقائب'), findsNothing);
      expect(find.text('منتج ملابس'), findsNothing);
    });
  });
}
