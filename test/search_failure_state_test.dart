// [REGRESSION GUARD] فشل طلب البحث لا يترك الشاشة تدور إلى الأبد.
//
// كان `_search` ينتظر الطلب بلا مسار فشل: استثناءٌ من الخادم أو الشبكة يتركه
// `_loading = true` — مؤشّرٌ يدور بلا نهاية، لا نتيجة ولا رسالة ولا زرّ
// إعادة محاولة، والمستخدم يحسب البحث ما زال جارياً. الحارس هنا: كل مسارٍ
// يُخرج من التحميل؛ الفشل يعرض حالة خطأٍ بزرّ إعادة محاولة تعيد البحث؛ ونجاحٌ
// أو فشلٌ لطلبٍ سابق لا يطمس حالة الطلب الأحدث (`RequestSequence`).
//
// الطلبات تُكمَل من الاختبار (`Completer`) لا بالنوم: ترتيبُ الأحداث محسوم.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
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

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

class _Boom implements Exception {
  @override
  String toString() => 'انقطع الاتصال';
}

Product _product(String id, String name) => Product(
  id: id,
  name: name,
  price: 1000,
  description: '',
  images: const [],
  categoryId: 'c1',
);

/// مستودعٌ يتحكّم الاختبار في لحظة اكتمال كل طلب بحث — نجاحاً أو فشلاً.
class _Repo implements ProductRepository {
  final List<Completer<ProductPage>> searchRequests = [];
  final List<String> queries = [];

  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20, ProductSort? sort}) {
    final completer = Completer<ProductPage>();
    searchRequests.add(completer);
    queries.add(query);
    return completer.future;
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
  @override
  Future<Product> fetchProductDetails(String id) async => throw UnimplementedError();
}

Widget _app(_Repo repo) => RepositoryProvider.value(
  value: SearchProductsUsecase(repo),
  child: MultiBlocProvider(
    providers: [
      BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
      BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
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
      home: const SearchScreen(),
    ),
  ),
);

Future<void> _submit(WidgetTester tester, String query) async {
  await tester.enterText(find.byType(TextField).first, query);
  await tester.testTextInput.receiveAction(TextInputAction.search);
  await tester.pump();
}

final _spinner = find.byType(CircularProgressIndicator);
final _retry = find.text('إعادة المحاولة');

void main() {
  setUpAll(loadProjectFonts);

  late _Repo repo;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    if (sl.isRegistered<SearchHistoryStorage>()) sl.unregister<SearchHistoryStorage>();
    sl.registerSingleton<SearchHistoryStorage>(SearchHistoryStorage(prefs));
    repo = _Repo();
  });

  tearDown(() => sl.unregister<SearchHistoryStorage>());

  Future<void> pumpScreen(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(repo));
    await tester.pump();
  }

  testWidgets('[CRITICAL] الطلب يفشل: التحميل ينتهي وتظهر حالة خطأ بزرّ إعادة محاولة — لا مؤشّر أبدي', (tester) async {
    await pumpScreen(tester);

    await _submit(tester, 'ناروتو');
    expect(_spinner, findsOneWidget, reason: 'التحميل يبدأ مع الطلب');

    repo.searchRequests[0].completeError(_Boom());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(_spinner, findsNothing, reason: 'الفشل يجب أن يُخرج من التحميل');
    expect(_retry, findsOneWidget, reason: 'حالة الخطأ تعرض إعادة المحاولة');
    expect(tester.takeException(), isNull);
  });

  testWidgets('إعادة المحاولة بعد الفشل تعيد الاستعلام نفسه وتعرض النتائج حين تنجح', (tester) async {
    await pumpScreen(tester);
    await _submit(tester, 'ناروتو');
    repo.searchRequests[0].completeError(_Boom());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(_retry, findsOneWidget);

    await tester.tap(_retry);
    await tester.pump();
    expect(repo.queries, ['ناروتو', 'ناروتو']);
    expect(_spinner, findsOneWidget, reason: 'إعادة المحاولة طلبٌ جديد بتحميله');

    repo.searchRequests[1].complete(ProductPage(items: [_product('n', 'دفتر ناروتو')], hasMore: false));
    await tester.pumpAndSettle();
    expect(find.text('دفتر ناروتو'), findsOneWidget);
    expect(_retry, findsNothing);
    expect(_spinner, findsNothing);
  });

  testWidgets('[CRITICAL] فشل طلبٍ سابق يصل بعد نجاح اللاحق لا يطمس النتائج', (tester) async {
    await pumpScreen(tester);
    await _submit(tester, 'ناروتو');
    await _submit(tester, 'لوفي');
    expect(repo.queries, ['ناروتو', 'لوفي']);

    repo.searchRequests[1].complete(ProductPage(items: [_product('l', 'قبعة لوفي')], hasMore: false));
    await tester.pumpAndSettle();
    expect(find.text('قبعة لوفي'), findsOneWidget);

    repo.searchRequests[0].completeError(_Boom());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('قبعة لوفي'), findsOneWidget, reason: 'فشلٌ قديم لا يطمس نتائج الطلب الأحدث');
    expect(_retry, findsNothing);
    expect(_spinner, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('استعلامٌ فارغ يعود إلى الحالة الأولى بلا طلب ولا تحميل', (tester) async {
    await pumpScreen(tester);
    await _submit(tester, '   ');
    expect(repo.queries, isEmpty);
    expect(_spinner, findsNothing);
    expect(_retry, findsNothing);
  });

  testWidgets('لا نتائج: حالة «لا نتائج» لا خطأ ولا تحميل', (tester) async {
    await pumpScreen(tester);
    await _submit(tester, 'لا شيء');
    repo.searchRequests[0].complete(const ProductPage(items: [], hasMore: false));
    await tester.pumpAndSettle();
    expect(_spinner, findsNothing);
    expect(_retry, findsNothing);
    expect(find.byType(AnimeEmptyState), findsOneWidget);
  });
}
