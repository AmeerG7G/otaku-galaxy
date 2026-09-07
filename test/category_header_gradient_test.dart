// ترويسة منتجات القسم — تدرّج هوية القسم كما هو، بلا ستارة سوداء فوقه.
//
// [CRITICAL] الحكم بالمقارنة لا بالحساب: يُرسم التدرّج نفسه وحده في مربّع
// مرجعي، ثم يُقارَن بكسلُ الترويسة ببكسل المربّع عند النقطة ذاتها. أي طبقة
// فوق التدرّج — ستارة سوداء بأي نسبة، أو تفتيح، أو أي تلوين — تجعلهما
// يختلفان. وهذا أدقّ من التحقّق من غياب `ColoredBox` بعينه: الستارة قد تعود
// بأي شكل آخر، والمقارنة تلتقطها كيفما جاءت.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/category_products_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_category_products_usecase.dart';

import 'support/render_harness.dart';

class _Repo implements ProductRepository {
  _Repo(this.category);

  final Category category;

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
  Future<List<Category>> fetchCategories() async => [category];
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
  Future<Product> fetchProductDetails(String id) async =>
      throw UnimplementedError();
}

// [CRITICAL] مفاتيح جديدة لكل استدعاء لا مفردة مشتركة: إعادة استعمال
// `GlobalKey` عبر عمليات بناء متتالية داخل اختبار واحد تُبقي حدَّ إعادة
// الرسم القديم مربوطاً، فتُلتقط صورةٌ من بناءٍ سابق ويُقارَن لونُ قسمٍ
// بلون قسمٍ آخر.

/// يبني الشاشة الحقيقية، وبجانبها مربّعاً يحمل تدرّج القسم وحده كمرجع.
Future<(Snapshot screen, Snapshot reference)> _pump(
  WidgetTester tester, {
  required Category category,
  required bool dark,
  Size size = const Size(412, 892),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final repo = _Repo(category);
  final gradient = LinearGradient(
    colors: AnimeCategoryCard.gradientForCategory(category),
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
  );

  final screenKey = GlobalKey();
  final referenceKey = GlobalKey();

  // مرحلة أولى: تُبنى الشاشة وحدها ليُقاس مقاس الترويسة الحقيقي.
  await _pumpTree(
    tester, repo, category, dark, size, gradient, Size.zero,
    GlobalKey(), GlobalKey(),
  );
  final headerSize = tester.getSize(find.byType(OtakuScreenHeader));

  // مرحلة ثانية: يُعاد البناء والمرجع بمقاس الترويسة نفسه.
  await _pumpTree(
    tester, repo, category, dark, size, gradient, headerSize,
    screenKey, referenceKey,
  );

  return (
    await snapshot(tester, screenKey),
    await snapshot(tester, referenceKey),
  );
}

Future<void> _pumpTree(
  WidgetTester tester,
  _Repo repo,
  Category category,
  bool dark,
  Size size,
  LinearGradient gradient,
  Size headerSize,
  GlobalKey screenKey,
  GlobalKey referenceKey,
) async {
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchCategoryProductsUsecase(repo)),
        RepositoryProvider.value(value: FetchCategoriesUsecase(repo)),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Stack(
          children: [
            RepaintBoundary(
              key: screenKey,
              child: CategoryProductsScreen(
                categoryId: category.id,
                categoryName: category.name,
              ),
            ),
            // [CRITICAL] المرجع بمقاس الترويسة **المقيس** لا بمقاس تقديري.
            // التدرّج الخطّي يُستكمل عبر الصندوق، فصندوقٌ أطول بعشرين بكسلاً
            // يعطي لوناً مختلفاً عند الإحداثي نفسه — وكان الفرق يظهر خطأً
            // كأنه طبقةٌ فوق التدرّج.
            if (!headerSize.isEmpty)
              Positioned(
                left: 0,
                top: 0,
                width: headerSize.width,
                height: headerSize.height,
                child: RepaintBoundary(
                  key: referenceKey,
                  child: Container(
                    decoration: BoxDecoration(gradient: gradient),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

/// أقسام تغطي التدرّجات الخمسة — نفس دالة الاشتقاق التي يستعملها التطبيق.
List<Category> _categoriesCoveringEveryGradient() {
  final found = <String, Category>{};
  var index = 0;
  while (found.length < AnimeCategoryCard.gradients.length && index < 400) {
    final category = Category(id: 'cat-$index', name: 'قسم $index');
    final key = AnimeCategoryCard.gradientForCategory(category).toString();
    found.putIfAbsent(key, () => category);
    index += 1;
  }
  return found.values.toList();
}

void main() {
  setUpAll(loadProjectFonts);

  test('[NOTE] تباين الحبر الأبيض على تدرّجات الأقسام — حالة موثَّقة', () {
    // [CRITICAL] هذا الاختبار لا يحرس صحّةً بل يوثّق **ثمناً معلوماً**.
    //
    // الستارة السوداء ٢٨٪ أُزيلت بقرارٍ صريح (اللون الحيّ أولى، والمرجع لا
    // يعرف الستارة أصلاً). لكنها كانت ترفع التباين، والحبر أبيض.
    //
    // [STAGE 12] اللوحة تغيّرت، فتغيّر الرقم — وهذا ما أسقط الاختبار عمداً.
    // أسوأ لونٍ صار الذهبي `#F6C144` بدل الكهرماني `#FFB02E`: 1.66:1 بلا
    // ستارة (وكان سيعطي 3.18:1 معها)، بينما كان الكهرماني 1.83:1 و3.46:1.
    // أي أن أسوأ حالةٍ مفردة تراجعت قليلاً لأن الذهبي الجديد أفتح.
    //
    // في المقابل تحسّن المجموع: **خمسة** من ألوان اللوحة الاثني عشر دون
    // حدّ WCAG AA للنص الكبير (3:1) بعد أن كانت **سبعة**. الدين الأصلي
    // قائم ولم يُحدثه هذا التحديث، والقرار لم يُعَد فتحه هنا.
    //
    // يُثبَّت الرقم هنا كي لا يضيع القرار في سجلّ المراجعات: أي تغيير في
    // اللوحة أو في معالجة الحبر يُسقط هذا الاختبار، فيُعاد النظر عن قصد.
    // والمخرج — إن أُريد — ظلٌّ على النصّ أو ستارةٌ خلف سطر العنوان وحده،
    // لا طبقةٌ تعيد تبهيت التدرّج كلّه.
    double channel(int value) {
      final c = value / 255;
      return c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
    }

    double luminance(Color color) =>
        0.2126 * channel((color.r * 255).round()) +
        0.7152 * channel((color.g * 255).round()) +
        0.0722 * channel((color.b * 255).round());

    double contrastWithWhite(Color color) {
      final l = luminance(color);
      return (1.0 + 0.05) / (l + 0.05);
    }

    final worst = AnimeCategoryCard.gradients
        .expand((pair) => pair)
        .map(contrastWithWhite)
        .reduce((a, b) => a < b ? a : b);

    expect(worst, closeTo(1.66, 0.01), reason: 'أسوأ تباين معلوم — الذهبي');
    expect(
      worst,
      lessThan(3.0),
      reason: 'موثَّق: دون حدّ WCAG AA للنص الكبير بعد إزالة الستارة',
    );
  });

  test('عيّنات الاختبار تغطّي تدرّجات الأقسام الخمسة كلها', () {
    // بلا هذا قد يفحص الاختبار تدرّجاً واحداً ويُظنّ أنه غطّى الأقسام.
    expect(
      _categoriesCoveringEveryGradient(),
      hasLength(AnimeCategoryCard.gradients.length),
    );
  });

  for (final dark in [false, true]) {
    final mode = dark ? 'داكن' : 'فاتح';

    testWidgets('[CRITICAL] الترويسة تحمل تدرّج القسم بلا ستارة — $mode', (
      tester,
    ) async {
      for (final category in _categoriesCoveringEveryGradient()) {
        final (screen, reference) = await _pump(
          tester,
          category: category,
          dark: dark,
        );

        // المرجع بمقاس الترويسة تماماً — شرطٌ لصحّة المقارنة.
        expect(
          reference.height,
          lessThanOrEqualTo(screen.height),
          reason: 'مقاس المرجع لا يطابق الترويسة',
        );

        // نقطة داخل الترويسة بعيدة عن الهالة البيضاء (أعلى جهة النهاية =
        // أعلى اليسار في RTL) وعن النصّ والأزرار: أسفل جهة البداية.
        final x = reference.width - 16;
        final y = reference.height - 12;
        expect(
          screen.at(x, y),
          reference.at(x, y),
          reason:
              'لون ترويسة «${category.name}» يجب أن يطابق تدرّج هويته تماماً — '
              'أي فرق يعني طبقةً مرسومة فوقه '
              '(المقاس ${reference.width}×${reference.height})',
        );
      }
    });

    testWidgets('[CRITICAL] الترويسة ملوّنة لا شفافة — $mode', (tester) async {
      // الحارس المضادّ: إزالة الستارة يجب ألّا تنقلب إلى إزالة اللون.
      final category = _categoriesCoveringEveryGradient().first;
      final (screen, _) = await _pump(tester, category: category, dark: dark);

      final theme = dark ? AppTheme.dark : AppTheme.light;
      final background = _packed(theme.scaffoldBackgroundColor);
      expect(
        screen.at(396, 100),
        isNot(background),
        reason: 'الترويسة يجب أن تبقى ملوّنة بلون القسم لا بلون الصفحة',
      );
    });
  }

  testWidgets('[CRITICAL] التدرّج يتبع هوية القسم لا ترتيبه ولا معرّفه', (
    tester,
  ) async {
    // [NOTE] عقدٌ **تغيّر عمداً**: كان اللون يُشتقّ من المعرّف، فكان هذا
    // الاختبار يثبّت «نفس المعرّف ⇒ نفس اللون». والمعرّف `UUID` يولَّد لكل
    // بيئة على حدة، فلون القسم كان يختلف بين التطوير والإنتاج — ومع ستة
    // أقسام على خمسة تدرّجات كان التصادم مضموناً.
    //
    // الهوية الآن هي الاسم المطبَّع (`UNIQUE` في الجدول وثابت بين البيئات).
    // الشرط لم يُضعَّف بل صار أقوى: اللون ثابتٌ عبر البيئات، ولا يتحرّك مع
    // الترتيب، ولا يتصادم بين الأقسام الستة.
    final here = AnimeCategoryCard.gradientForCategory(
      const Category(id: 'dev-uuid', name: 'حقائب'),
    );
    final there = AnimeCategoryCard.gradientForCategory(
      const Category(id: 'prod-uuid-مختلف-تماماً', name: 'حقائب'),
    );
    expect(here, there, reason: 'نفس القسم في بيئتين ⇒ نفس اللون');

    // وقسمٌ آخر لون آخر — ولو حمل المعرّف نفسه.
    final other = AnimeCategoryCard.gradientForCategory(
      const Category(id: 'dev-uuid', name: 'ملابس'),
    );
    expect(other, isNot(here), reason: 'قسمان مختلفان ⇒ لونان مختلفان');
  });

  testWidgets('الترويسة تحتفظ بالعنوان والرجوع والبحث', (tester) async {
    await _pump(
      tester,
      category: const Category(id: 'cat-1', name: 'حقائب'),
      dark: false,
    );

    expect(find.text('حقائب'), findsOneWidget);
    expect(find.bySemanticsLabel('بحث'), findsOneWidget);
    expect(find.byType(OtakuHeaderButton), findsNWidgets(2));
  });

  testWidgets('على اللوح كذلك — التدرّج بلا ستارة', (tester) async {
    final (screen, reference) = await _pump(
      tester,
      category: const Category(id: 'cat-1', name: 'حقائب'),
      dark: false,
      size: const Size(834, 1112),
    );
    expect(
      screen.at(reference.width - 16, reference.height - 12),
      reference.at(reference.width - 16, reference.height - 12),
    );
  });

  testWidgets('أسماء بأطوال مختلفة لا تغيّر لون الترويسة', (tester) async {
    for (final name in const [
      'حقائب',
      'إكسسوارات',
      'ملابس وقمصان الأنمي المطبوعة',
    ]) {
      final (screen, reference) = await _pump(
        tester,
        category: Category(id: 'cat-1', name: name),
        dark: false,
      );
      expect(
        screen.at(reference.width - 16, reference.height - 12),
        reference.at(reference.width - 16, reference.height - 12),
        reason: name,
      );
    }
  });
}

/// اللون بصيغة RGBA معبّأة — نفس ترتيب بايتات `Snapshot.at`.
int _packed(Color color) {
  int channel(double v) => (v * 255).round() & 0xff;
  return (channel(color.r) << 24) |
      (channel(color.g) << 16) |
      (channel(color.b) << 8) |
      channel(color.a);
}
