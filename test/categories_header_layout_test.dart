// ترويسة الأقسام — رسم الشخصية (39)، موضعه، وعدم قصّه بالترويسة.
//
// الثوابت المحكومة:
//   characterTop  >= statusBarBottom   (لا تداخل مع شريط حالة النظام)
//   characterBottom > categoriesHeaderBottom  (الرسم يمتدّ أسفل الترويسة)
//   الرسم خارج صندوق OtakuScreenHeader        (لا قصّ بـ Clip.hardEdge)
//   الرسم آخر طفلٍ في المكدّس                  (يُرسم فوق الجميع)
//
// [CRITICAL] top = MediaQuery.paddingOf(context).top يضع قمّة الرسم عند
// أسفل شريط حالة النظام تماماً — نفس المبدأ الذي يستخدمه OtakuScreenHeader
// حين `artworkBelowStatusBar = true` — فيبدأ الرسم من منطقة المحتوى ويمتدّ
// أسفل الترويسة بلا أي قصّ.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
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
}) async {
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = FakeViewPadding(top: _statusBarHeight);
  addTearDown(tester.view.reset);

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
  await tester.pumpAndSettle();
}

Finder _charFinder() => find.byWidgetPredicate(
  (w) => w is CharacterArtwork && w.slot == VisualSlots.categoriesHeader,
);

void main() {
  const dir = 'assets/art/characters';

  // ── 1: صورة الأقسام هي 39 ────────────────────────────────────────────────

  test('[CRITICAL] 1 — categoriesHeader يستخدم 39.png', () {
    expect(CharacterArt.forSlot(VisualSlots.categoriesHeader), '$dir/39.png');
  });

  // ── 2: 38 حُذفت (2026-10-04) ─────────────────────────────────────────────

  test('[CRITICAL] 2 — 38.png لا وجود لها ولا يشير إليها موضع', () {
    expect(File('$dir/38.png').existsSync(), isFalse);
    expect(CharacterArt.assets.values, isNot(contains('$dir/38.png')));
    expect(CharacterArt.fixed, isNot(contains('$dir/38.png')));
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

  // ── 4: الرسم طبقةٌ أمامية (آخر طفلٍ في المكدّس) ────────────────────────

  testWidgets('[CRITICAL] 4 — الرسم آخر طفلٍ في المكدّس الخارجي', (tester) async {
    await _pump(tester);
    // الـ Stack الخارجي: أقرب Stack لا يحتوي OtakuScreenHeader مباشرةً.
    Stack? outerStack;
    tester.widgetList<Stack>(find.byType(Stack)).forEach((s) {
      if (s.children.any((c) => c is PositionedDirectional)) {
        outerStack ??= s;
      }
    });
    expect(outerStack, isNotNull, reason: 'لم يُعثر على Stack بـ PositionedDirectional');
    expect(
      outerStack!.children.last,
      isNot(isA<OtakuScreenHeader>()),
      reason: 'OtakuScreenHeader هو الطفل الأخير — الرسم يُرسم تحته',
    );
  });

  // ── 5: قمّة الرسم أسفل شريط حالة النظام ─────────────────────────────────

  testWidgets('[CRITICAL] 5 — قمّة الرسم ≥ ارتفاع شريط الحالة', (tester) async {
    await _pump(tester);
    final charTop = tester.getRect(_charFinder()).top;
    expect(
      charTop,
      greaterThanOrEqualTo(_statusBarHeight),
      reason: 'الرسم يدخل منطقة شريط حالة النظام',
    );
  });

  // ── 6 & 7: الرسم يمتدّ أسفل الترويسة ولا يُقصّ ──────────────────────────

  testWidgets('[CRITICAL] 6&7 — الرسم يمتدّ أسفل الترويسة ولا يقصّه صندوقها', (tester) async {
    await _pump(tester);
    final charBottom = tester.getRect(_charFinder()).bottom;
    final headerBottom = tester.getRect(find.byType(OtakuScreenHeader)).bottom;
    expect(
      charBottom,
      greaterThan(headerBottom),
      reason: 'الرسم لا يمتدّ أسفل الترويسة — شريط الحالة لم يُحتسب في top',
    );
  });

  // ── 8: الترويسة لا تتحرّك بسبب الرسم ───────────────────────────────────

  testWidgets('8 — موضع الترويسة لا يتأثّر بالرسم', (tester) async {
    await _pump(tester);
    // الترويسة تبدأ عند الصفر (أعلى Stack) وتمتدّ أسفله — مستقلّةٌ عن top الرسم.
    final headerTop = tester.getRect(find.byType(OtakuScreenHeader)).top;
    expect(headerTop, equals(0.0),
        reason: 'الترويسة تحرّكت — يجب أن تبدأ دائماً من أعلى الصفحة');
  });

  // ── 9-11: عروض متعدّدة (360 / 390 / 412 px) ─────────────────────────────

  for (final width in [360.0, 390.0, 412.0]) {
    final size = Size(width, 892);

    testWidgets('[CRITICAL] ${width.toInt()}px — قمّة أسفل شريط الحالة، قاع أسفل الترويسة', (tester) async {
      await _pump(tester, viewSize: size);

      final charRect   = tester.getRect(_charFinder());
      final headerRect = tester.getRect(find.byType(OtakuScreenHeader));

      expect(charRect.top, greaterThanOrEqualTo(_statusBarHeight),
          reason: '${width.toInt()}px: الرسم يدخل شريط الحالة');
      expect(charRect.bottom, greaterThan(headerRect.bottom),
          reason: '${width.toInt()}px: الرسم لا يمتدّ أسفل الترويسة');

      expect(
        find.ancestor(of: _charFinder(), matching: find.byType(OtakuScreenHeader)),
        findsNothing,
        reason: '${width.toInt()}px: الرسم داخل صندوق الترويسة',
      );
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
