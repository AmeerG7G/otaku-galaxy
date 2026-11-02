// ترويسة الأقسام — رسم الشخصية (39)، موضعه، وعدم قصّه بالترويسة.
//
// الثوابت المحكومة:
//   characterTop == statusBarBottom          (لا يقع رأس الشخصية تحت الساعة والبطارية)
//   characterBottom <= أعلى البطاقة الأولى    (لا يدخل في بطاقة القسم الأولى)
//   characterWidth <= 110                     (يُصغَّر بنسبته حين لا يتّسع، ولا يكبر)
//   العنوان تحت شريط الحالة                    (لا نصَّ تحت أيقونات النظام)
//   الرسم خارج صندوق OtakuScreenHeader        (لا قصّ بـ Clip.hardEdge)
//   الرسم آخر ما يُرسم                         (فوق القائمة حين تُمرَّر)
//
// [CRITICAL] (المالك، 2026-10-26) يحلّ محلّ قرار 2026-10-10 «`top: 0`، الرسم في
// منطقة شريط الحالة»: الرأس كان تحت الساعة والبطارية. وإنزاله وحده (`a83fdf9`)
// يُدخل أسفله ٢٣ بكسل في البطاقة الأولى، فالرسم محصورٌ بين الحدّين.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/categories_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

class _StubRepo implements ProductRepository {
  const _StubRepo();

  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<HomeData> fetchHome() async => const HomeData();
  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async => const [];
  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
    ProductSort? sort,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<Product> fetchProductDetails(String id) =>
      throw UnimplementedError();
}

const _statusBarHeight = 24.0;

Future<void> _pump(
  WidgetTester tester, {
  TextDirection direction = TextDirection.rtl,
  Size viewSize = const Size(412, 892),
  double statusBar = _statusBarHeight,
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = FakeViewPadding(top: statusBar);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

  await tester.pumpWidget(
    RepositoryProvider<FetchCategoriesUsecase>(
      create: (_) => FetchCategoriesUsecase(const _StubRepo()),
      child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Directionality(
          textDirection: direction,
          child: const CategoriesScreen(),
        ),
      ),
    ),
  );
  // الرسم بلا عرضٍ ثابت: مقاسه من الصورة المفكوكة، فتُفكّ قبل القياس.
  await tester.runAsync(
    () => precacheImage(
      AssetImage(CharacterArt.forSlot(VisualSlots.categoriesHeader)!),
      tester.element(find.byType(CategoriesScreen)),
    ),
  );
  await tester.pumpAndSettle();
}

/// أعلى البطاقة الأولى — أسفل الترويسة + فراغ القائمة.
double _firstCardTop(WidgetTester tester) =>
    tester.getRect(find.byType(OtakuScreenHeader)).bottom +
    CategoriesScreen.listTop;

Finder _charFinder() => find.byWidgetPredicate(
  (w) => w is CharacterArtwork && w.slot == VisualSlots.categoriesHeader,
);

void main() {
  const dir = 'assets/art/characters';

  // ── 1: صورة الأقسام هي 39 ────────────────────────────────────────────────

  test('[CRITICAL] 1 — categoriesHeader يستخدم 39.png', () {
    expect(CharacterArt.forSlot(VisualSlots.categoriesHeader), '$dir/39.png');
  });

  // ── 2: 38 مستعملة من emptyCollection ────────────────────────────────────

  test('[CRITICAL] 2 — emptyCollection تستخدم 38.png وهي موجودة', () {
    expect(CharacterArt.emptyCollection, '$dir/38.png');
    expect(File('$dir/38.png').existsSync(), isTrue);
  });

  // ── 3: الرسم خارج OtakuScreenHeader ─────────────────────────────────────

  testWidgets('[CRITICAL] 3 — الرسم خارج OtakuScreenHeader (لا قصّ بـ Clip.hardEdge)', (tester) async {
    await _pump(tester);
    expect(_charFinder(), findsOneWidget);
    expect(
      find.ancestor(of: _charFinder(), matching: find.byType(OtakuScreenHeader)),
      findsNothing,
      reason: 'الرسم داخل OtakuScreenHeader — سيُقصّ عند ارتفاعها',
    );
  });

  // ── 4: الرسم طبقةٌ أمامية (آخر ما يُرسم) ─────────────────────────────

  testWidgets('[CRITICAL] 4 — الرسم آخر طفلٍ في التخطيط (فوق القائمة)', (tester) async {
    await _pump(tester);
    final layout = tester.widget<CustomMultiChildLayout>(
      find.descendant(
        of: find.byType(CategoriesScreen),
        matching: find.byType(CustomMultiChildLayout),
      ).first,
    );
    expect(
      find.descendant(
        of: find.byWidget(layout.children.last),
        matching: _charFinder(),
      ),
      findsOneWidget,
    );
  });

  // ── 5: تحت شريط الحالة تماماً، بأي ارتفاعٍ له ──────────────────────────

  for (final statusBar in [24.0, 48.0]) {
    testWidgets('[CRITICAL] 5 — شريط حالة $statusBar: الرسم يبدأ أسفله تماماً', (tester) async {
      await _pump(tester, statusBar: statusBar);
      final art = tester.getRect(_charFinder());
      expect(art.top, closeTo(statusBar, 0.01), reason: 'رأس الشخصية تحت أيقونات النظام');
      expect(art.height, greaterThan(0), reason: 'الرسم لم يُفكّ');
      expect(art.bottom, lessThanOrEqualTo(_firstCardTop(tester) + 0.01),
          reason: 'الرسم يدخل في البطاقة الأولى');
    });
  }

  // ── 6&7: محصورٌ بين الحدّين، يُصغَّر بنسبته ولا يتجاوز ١١٠ ──────────────

  testWidgets('[CRITICAL] 6&7 — ينتهي عند البطاقة الأولى ويحفظ نسبته', (tester) async {
    await _pump(tester);
    final art = tester.getRect(_charFinder());
    expect(art.width, lessThanOrEqualTo(CategoriesScreen.artMaxWidth + 0.01));
    // 39.png = ٧٣٦×٨٨٤: النسبة محفوظة (لا تمطيط).
    expect(art.width / art.height, closeTo(736 / 884, 0.01));
    // بلا مساحةٍ ضائعة: إمّا العرض الأقصى، وإمّا يملأ الارتفاع حتى البطاقة.
    final fillsHeight = (art.bottom - _firstCardTop(tester)).abs() < 0.5;
    final fullWidth = (art.width - CategoriesScreen.artMaxWidth).abs() < 0.5;
    expect(fillsHeight || fullWidth, isTrue, reason: '$art');
  });

  testWidgets('خطّ ×١٫٣ — الترويسة أطول فيتّسع الرسم، ويبقى ضمن الحدّين', (tester) async {
    await _pump(tester, textScale: 1.3);
    final art = tester.getRect(_charFinder());
    expect(art.top, closeTo(_statusBarHeight, 0.01));
    expect(art.bottom, lessThanOrEqualTo(_firstCardTop(tester) + 0.01));
    expect(art.width, lessThanOrEqualTo(CategoriesScreen.artMaxWidth + 0.01));
  });

  // ── 8: الترويسة لا تتحرّك بسبب الرسم ───────────────────────────────────

  testWidgets('8 — الترويسة (تدرّجها) تبدأ من أعلى الشاشة', (tester) async {
    await _pump(tester);
    expect(tester.getRect(find.byType(OtakuScreenHeader)).top, equals(0.0));
  });

  // ── 9-11: عروض متعدّدة (320 / 360 / 390 / 412 / 430 px) ────────────────

  for (final width in [320.0, 360.0, 390.0, 412.0, 430.0]) {
    final size = Size(width, 892);

    testWidgets('[CRITICAL] ${width.toInt()}px — تحت شريط الحالة، فوق البطاقة، والعنوان ظاهر', (tester) async {
      await _pump(tester, viewSize: size);

      final charRect = tester.getRect(_charFinder());
      expect(charRect.top, closeTo(_statusBarHeight, 0.01));
      expect(charRect.bottom, lessThanOrEqualTo(_firstCardTop(tester) + 0.01));
      expect(charRect.left, greaterThanOrEqualTo(-CategoriesScreen.artEndOverhang - 0.01));
      expect(tester.getRect(find.text(AppStrings.arabic('navCategories'))).top,
          greaterThanOrEqualTo(_statusBarHeight),
          reason: '${width.toInt()}px: العنوان تحت أيقونات النظام');
      expect(
        find.ancestor(of: _charFinder(), matching: find.byType(OtakuScreenHeader)),
        findsNothing,
        reason: '${width.toInt()}px: الرسم داخل صندوق الترويسة',
      );
      expect(tester.takeException(), isNull);
    });
  }

  // ── 12-13: RTL وLTR ───────────────────────────────────────────────────────

  testWidgets('[CRITICAL] 12 — RTL: الرسم في الجهة اليسرى (end = يسار في RTL)', (tester) async {
    await _pump(tester, direction: TextDirection.rtl);
    final charCenter = tester.getRect(_charFinder()).center.dx;
    final screenWidth = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    expect(charCenter, lessThan(screenWidth / 2),
        reason: 'RTL: الرسم يجب أن يكون في النصف الأيسر');
  });

  testWidgets('[CRITICAL] 13 — LTR: الرسم في الجهة اليمنى (end = يمين في LTR)', (tester) async {
    await _pump(tester, direction: TextDirection.ltr);
    final charCenter = tester.getRect(_charFinder()).center.dx;
    final screenWidth = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    expect(charCenter, greaterThan(screenWidth / 2),
        reason: 'LTR: الرسم يجب أن يكون في النصف الأيمن');
  });
}
