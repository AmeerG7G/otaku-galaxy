// الحالات الفارغة موسَّطة كالسلة: البحث بلا نتائج، و«مجموعاتي» بلا مجموعات،
// وتفاصيل مجموعةٍ بلا منتجات.
//
// الترتيب: الرسم فوق، ثم النصّ موسَّطاً، ثم زرّ الإجراء في المنتصف — نفس
// `AnimeEmptyState(centered: true)` الذي تستعمله السلة، لا نسخةٌ ثانية.
// وكان نصّ «مجموعاتي» الفارغة يلتصق بجهة البداية (لوحة تحريرية جانبية)،
// وكان زرّ البحث «تصفّح الأقسام» مثبّتاً في جهة البداية.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/features/collections/domain/entities/collection.dart';
import 'package:otaku_galaxy/features/collections/domain/repositories/collection_repository.dart';
import 'package:otaku_galaxy/features/collections/presentation/cubit/collections_cubit.dart';
import 'package:otaku_galaxy/features/collections/presentation/screens/collection_detail_screen.dart';
import 'package:otaku_galaxy/features/collections/presentation/screens/collections_tab.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_product_details_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/search_products_usecase.dart';
import 'package:otaku_galaxy/features/search/data/search_history_storage.dart';
import 'package:otaku_galaxy/features/search/presentation/screens/search_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/render_harness.dart';

class _EmptyProducts implements ProductRepository {
  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20, ProductSort? sort}) async =>
      const ProductPage(items: [], hasMore: false);
  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({int page = 1, int limit = 20, String? categoryId, String? subcategoryId}) async =>
      const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(String categoryId, {ProductSort? sort}) async => const [];
  @override
  Future<Product> fetchProductDetails(String id) async => throw UnimplementedError();
}

class _NoCollections implements CollectionRepository {
  _NoCollections({this.items = const []});
  final List<Collection> items;
  @override
  Future<List<Collection>> fetchAll() async => items;
  @override
  Future<Collection> create(String name) async => Collection(id: 'c', name: name);
  @override
  Future<void> rename(String id, String name) async {}
  @override
  Future<void> delete(String id) async {}
  @override
  Future<void> addProduct(String collectionId, String productId) async {}
  @override
  Future<void> removeProduct(String collectionId, String productId) async {}
}

Widget _app(Widget home) => MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: home,
);

/// يقيس التركيب الموسَّط: الرسم فوق النصّ فوق الزرّ، وثلاثتها على محور اللوحة.
void _expectCentered(WidgetTester tester, {required String title, String? action}) {
  final state = find.byType(AnimeEmptyState);
  expect(state, findsOneWidget);
  final centered = tester.widget<AnimeEmptyState>(state).centered;
  expect(centered, isTrue, reason: 'نمط السلة الموسَّط لا الجانبي');

  final panel = tester.getRect(
    find.descendant(of: find.byType(SingleChildScrollView), matching: find.byType(Container)).first,
  );
  final image = tester.getRect(find.descendant(of: state, matching: find.byType(Image)).first);
  final text = tester.getRect(find.descendant(of: state, matching: find.text(title)));

  expect(image.bottom, lessThanOrEqualTo(text.top + 1), reason: 'الرسم فوق النصّ');
  expect(image.center.dx, closeTo(panel.center.dx, 6), reason: 'الرسم موسَّط');
  expect(text.center.dx, closeTo(panel.center.dx, 6), reason: 'النصّ موسَّط');

  if (action != null) {
    final button = tester.getRect(find.descendant(of: state, matching: find.text(action)));
    expect(text.bottom, lessThanOrEqualTo(button.top + 1), reason: 'النصّ فوق الزرّ');
    expect(button.center.dx, closeTo(panel.center.dx, 6), reason: 'الزرّ موسَّط — لا في جهة البداية');
    expect(tester.widget<Text>(find.descendant(of: state, matching: find.text(title))).textAlign, TextAlign.center);
  } else {
    // No action button - verify it's not present and text is last element
    expect(find.descendant(of: state, matching: find.byType(AnimePrimaryButton)), findsNothing);
    expect(tester.widget<Text>(find.descendant(of: state, matching: find.text(title))).textAlign, TextAlign.center);
  }
}

void main() {
  setUpAll(loadProjectFonts);

  testWidgets('[CRITICAL] البحث بلا نتائج: رسم ← نصّ ← زرّ «تصفّح الأقسام» موسَّطة', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    if (sl.isRegistered<SearchHistoryStorage>()) sl.unregister<SearchHistoryStorage>();
    sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
    addTearDown(() => sl.unregister<SearchHistoryStorage>());

    await tester.pumpWidget(
      RepositoryProvider.value(
        value: SearchProductsUsecase(_EmptyProducts()),
        child: _app(const SearchScreen()),
      ),
    );
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, 'لا شيء');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    _expectCentered(tester, title: 'لا توجد نتائج', action: 'تصفّح الأقسام');
  });

  testWidgets('[CRITICAL] «مجموعاتي» بلا مجموعات: رسم ← نصّ موسَّط، بلا زرّ إنشاء', (tester) async {
    tester.view.physicalSize = const Size(412, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      BlocProvider<CollectionsCubit>(
        create: (_) => CollectionsCubit(_NoCollections()),
        child: _app(const Scaffold(body: CollectionsTab())),
      ),
    );
    await tester.pumpAndSettle();

    _expectCentered(tester, title: 'أنشئ مجموعتك الأولى', action: null);
    // النصّ التوضيحي «مجموعاتك خاصة بك…» أُزيل من الشاشة.
    expect(find.textContaining('مجموعاتك خاصة'), findsNothing);
    // لا زر «مجموعة جديدة» في الحالة الفارغة — الإنشاء يتم عبر اللوحة أدناه.
    expect(find.descendant(of: find.byType(AnimeEmptyState), matching: find.byType(AnimePrimaryButton)), findsNothing);
  });

  testWidgets('[CRITICAL] مجموعةٌ بلا منتجات: رسم ← نصّ ← زرّ «تصفّح الأقسام» موسَّطة، والزرّ يذهب إلى تبويب الأقسام', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    mainNavIndex.value = 0;
    addTearDown(() => mainNavIndex.value = 0);

    await tester.pumpWidget(
      MultiRepositoryProvider(
        providers: [
          RepositoryProvider.value(value: FetchProductDetailsUsecase(_EmptyProducts())),
        ],
        child: BlocProvider<CollectionsCubit>(
          create: (_) => CollectionsCubit(
            _NoCollections(items: const [Collection(id: 'c1', name: 'مجموعتي')]),
          ),
          child: _app(const CollectionDetailScreen(collectionId: 'c1', collectionName: 'مجموعتي')),
        ),
      ),
    );
    await tester.pumpAndSettle();

    _expectCentered(tester, title: 'المجموعة فارغة', action: 'تصفّح الأقسام');
    // الزرّ يختار تبويب الأقسام ثم يعود إلى الجذر. لا موجّه في هذا الاختبار،
    // فالعودة ترمي استثناء الموجّه وحده — ويكون التبويب قد اختير قبله.
    await tester.tap(find.descendant(of: find.byType(AnimeEmptyState), matching: find.text('تصفّح الأقسام')));
    await tester.pump();
    expect(mainNavIndex.value, MainTab.categories);
    expect(tester.takeException().toString(), contains('AutoRouter'));
  });
}
