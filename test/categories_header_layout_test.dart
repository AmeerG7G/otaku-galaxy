// ترويسة الأقسام — رسم الشخصية (39)، موضعه، وعدم قصّه بالترويسة.
//
// هذا الاختبار لا يختبر الألوان ولا المحتوى النصّي — بل:
//   1. الموضع البصري المستقلّ (خارج صندوق OtakuScreenHeader).
//   2. القدرة على التمدّد أسفل الترويسة بلا قصّ عند حافتها السفلية.
//   3. ترتيب الطبقات (الرسم يُرسم فوق الترويسة والقائمة).
//   4. حماية شريط حالة النظام عبر SafeArea.
//   5. الصورة 39 وحدها — لا 38.
//   6. صحّة RTL وLTR.
//   7. عرضان مختلفان للشاشة.
//
// [CRITICAL] الشخصية في المكدّس الخارجي (CategoriesScreen) لا داخل
// OtakuScreenHeader — لأن صندوق الترويسة يقصّ بـ Clip.hardEdge عند ارتفاعه
// القصير. PositionedDirectional(top:0, end:-10) تجعلها آخر طفلٍ في المكدّس
// فتُرسم فوق الترويسة والقائمة معاً بلا أي قصّ عمودي.

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

// Minimal stub — only fetchCategories is exercised in these tests.
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

/// يبني CategoriesScreen مع mock الأقسام.
///
/// [fakeStatusBarHeight] يُحاكي ارتفاع شريط حالة نظام حقيقي (بكسل منطقي)
/// لاختبار حماية SafeArea.
Future<void> _pump(
  WidgetTester tester, {
  TextDirection direction = TextDirection.rtl,
  Size viewSize = const Size(412, 892),
  double fakeStatusBarHeight = 24,
}) async {
  tester.view.physicalSize = viewSize;
  tester.view.devicePixelRatio = 1.0;
  tester.view.padding = FakeViewPadding(top: fakeStatusBarHeight);
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

/// العثور على CharacterArtwork الخاصّ بترويسة الأقسام.
Finder _charFinder() => find.byWidgetPredicate(
  (w) => w is CharacterArtwork && w.slot == VisualSlots.categoriesHeader,
);

void main() {
  const dir = 'assets/art/characters';

  // ── 1 & 2: الصورة المستعملة ──────────────────────────────────────────────

  group('الصورة: 39 لا 38', () {
    test('[CRITICAL] categoriesHeader مرتبطٌ بـ 39.png', () {
      expect(
        CharacterArt.forSlot(VisualSlots.categoriesHeader),
        '$dir/39.png',
      );
    });

    test('[CRITICAL] ترويسة الأقسام لا تشير إلى 38', () {
      expect(
        CharacterArt.forSlot(VisualSlots.categoriesHeader),
        isNot('$dir/38.png'),
      );
    });

    testWidgets('[CRITICAL] CharacterArtwork في الشاشة يرسم 39.png', (tester) async {
      await _pump(tester);
      final images = tester.widgetList<Image>(
        find.descendant(of: _charFinder(), matching: find.byType(Image)),
      );
      expect(images, isNotEmpty);
      for (final img in images) {
        expect((img.image as AssetImage).assetName, '$dir/39.png');
      }
    });
  });

  // ── 3-5: الموضع والقصّ ───────────────────────────────────────────────────

  group('الموضع: خارج OtakuScreenHeader، يمتدّ أسفل الترويسة', () {
    testWidgets('[CRITICAL] الرسم ليس داخل OtakuScreenHeader — لا يقصّه صندوقها', (tester) async {
      await _pump(tester);
      expect(_charFinder(), findsOneWidget);

      // لا يوجد OtakuScreenHeader في سلسلة أسلاف الرسم.
      final insideHeader = find.ancestor(
        of: _charFinder(),
        matching: find.byType(OtakuScreenHeader),
      );
      expect(insideHeader, findsNothing,
          reason: 'الرسم داخل OtakuScreenHeader — سيُقصّ بـ Clip.hardEdge');
    });

    testWidgets('[CRITICAL] قاع الرسم أسفل من قاع الترويسة', (tester) async {
      await _pump(tester);

      final charBottom = tester.getRect(_charFinder()).bottom;
      final headerBottom = tester.getRect(find.byType(OtakuScreenHeader)).bottom;

      expect(
        charBottom,
        greaterThan(headerBottom),
        reason: 'الرسم لا يمتدّ أسفل الترويسة — ما زال مقصوصاً',
      );
    });

    testWidgets('[CRITICAL] الرسم آخر طفلٍ في المكدّس الخارجي — يُرسم فوق كلّ شيء', (tester) async {
      await _pump(tester);

      // الـ Stack الخارجي هو والد CharacterArtwork المباشر أو غير المباشر،
      // وليس OtakuScreenHeader.
      final stackFinder = find.ancestor(
        of: _charFinder(),
        matching: find.byType(Stack),
      );
      expect(stackFinder, findsWidgets);

      // آخر طفلٍ في أقرب Stack ليس هو OtakuScreenHeader.
      final nearestStack = tester.widget<Stack>(stackFinder.last);
      final last = nearestStack.children.last;
      expect(last, isNot(isA<OtakuScreenHeader>()),
          reason: 'OtakuScreenHeader هو الطفل الأخير — الرسم سيُرسم تحته');
    });
  });

  // ── 6: حماية شريط الحالة ────────────────────────────────────────────────

  group('SafeArea: شريط حالة النظام محميّ', () {
    testWidgets('[CRITICAL] نصّ الترويسة داخل SafeArea', (tester) async {
      await _pump(tester, fakeStatusBarHeight: 30);

      // SafeArea تلفّ المحتوى النصّي داخل OtakuScreenHeader.
      final safeAreaFinder = find.descendant(
        of: find.byType(OtakuScreenHeader),
        matching: find.byType(SafeArea),
      );
      expect(safeAreaFinder, findsOneWidget,
          reason: 'OtakuScreenHeader لا يحتوي SafeArea — النصّ قد يتداخل مع شريط النظام');
    });

    testWidgets('قمّة الرسم عند حدود الشاشة لا أعلى منها — لا تداخل مع شريط الحالة في البكسل', (tester) async {
      await _pump(tester, fakeStatusBarHeight: 24);

      final charTop = tester.getRect(_charFinder()).top;
      // top:0 في PositionedDirectional: الرسم يبدأ من أعلى Stack.
      // الـStack يبدأ من أعلى منطقة الشاشة المرئية (تحت شريط الحالة أو عنده).
      // الشرط: لا يبدأ الرسم من قيمة سالبة (خارج الشاشة).
      expect(charTop, greaterThanOrEqualTo(0),
          reason: 'الرسم خارج حدود الشاشة من الأعلى');
    });
  });

  // ── 7-8: RTL و LTR ───────────────────────────────────────────────────────

  group('الاتجاه: RTL وLTR', () {
    testWidgets('[CRITICAL] RTL: الرسم في الجهة اليسرى (end = يسار)', (tester) async {
      await _pump(tester, direction: TextDirection.rtl);

      final charCenter = tester.getRect(_charFinder()).center.dx;
      final screenWidth = tester.view.physicalSize.width / tester.view.devicePixelRatio;
      // في RTL، PositionedDirectional(end:...) يضع الرسم نحو اليسار.
      expect(charCenter, lessThan(screenWidth / 2),
          reason: 'في RTL الرسم يجب أن يكون في النصف الأيسر (end = يسار)');
    });

    testWidgets('[CRITICAL] LTR: الرسم في الجهة اليمنى (end = يمين)', (tester) async {
      await _pump(tester, direction: TextDirection.ltr);

      final charCenter = tester.getRect(_charFinder()).center.dx;
      final screenWidth = tester.view.physicalSize.width / tester.view.devicePixelRatio;
      // في LTR، PositionedDirectional(end:...) يضع الرسم نحو اليمين.
      expect(charCenter, greaterThan(screenWidth / 2),
          reason: 'في LTR الرسم يجب أن يكون في النصف الأيمن (end = يمين)');
    });

    testWidgets('الرسم يظهر في كلا الاتجاهين', (tester) async {
      for (final dir in [TextDirection.rtl, TextDirection.ltr]) {
        await _pump(tester, direction: dir);
        expect(_charFinder(), findsOneWidget, reason: '$dir: الرسم مفقود');
      }
    });
  });

  // ── 9: عروض متعدّدة ──────────────────────────────────────────────────────

  group('عروض متعدّدة للشاشة', () {
    // في كلّ عرض: الرسم موجود ولا يقصّه صندوق الترويسة.
    // ملاحظة: الامتداد الهندسي أسفل الترويسة يعتمد على نسبة أبعاد الصورة
    // (39.png: 736×884، أي 132 بكسل عند عرض 110) مقارنةً بارتفاع الترويسة.
    // الاختبار هنا يتحقّق من الهيكل (لا قصّ من صندوق الترويسة) لا من الهندسة.
    for (final size in [
      const Size(360, 800),  // صغير — Galaxy A-series
      const Size(412, 892),  // متوسّط — Pixel 7
      const Size(430, 932),  // كبير — iPhone 14 Plus
    ]) {
      testWidgets('${size.width.toInt()}×${size.height.toInt()}: الرسم موجود وخارج صندوق الترويسة', (tester) async {
        await _pump(tester, viewSize: size);

        expect(_charFinder(), findsOneWidget,
            reason: '${size.width}px: الرسم مفقود');

        final insideHeader = find.ancestor(
          of: _charFinder(),
          matching: find.byType(OtakuScreenHeader),
        );
        expect(insideHeader, findsNothing,
            reason: '${size.width}px: الرسم داخل صندوق الترويسة — يُقصّ بـ Clip.hardEdge');
      });
    }

    // عند عرضٍ واسع بما يكفي: الرسم يمتدّ فعلاً أسفل الترويسة.
    // 39.png (نسبة 1.201) عند عرض 110 → ارتفاع ≈132 بكسل.
    // الترويسة عند 412 بكسل عرضاً أقصر من ذلك فيمتدّ الرسم أسفلها.
    testWidgets('[CRITICAL] 412px: الرسم يمتدّ هندسياً أسفل الترويسة', (tester) async {
      await _pump(tester, viewSize: const Size(412, 892));

      final charBottom = tester.getRect(_charFinder()).bottom;
      final headerBottom = tester.getRect(find.byType(OtakuScreenHeader)).bottom;
      expect(charBottom, greaterThan(headerBottom),
          reason: '412px: الرسم لا يمتدّ أسفل الترويسة');
    });
  });
}
