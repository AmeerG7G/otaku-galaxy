// [CRITICAL] صفّ منتجات الرئيسية بارتفاع أطول بطاقاته (البوّابة ٩، 2026-10-12).
//
// كان ٢٤٦ ثابتاً والبطاقة لا تعرفه: تكبر مع مقياس الخطّ وبسطر ترويج التوصيل،
// فيتجاوزها عمودها بالعربية والكردية معاً (٤ بكسل عند ×١٫٣ لبطاقةٍ بسيطة، ١٥
// عند ١٫٠ و٢٩ عند ×١٫٣ لبطاقةٍ بترويج). العقد: ٢٤٦ ما دامت البطاقات تتّسع
// (التصميم كما هو)، وإلا فبارتفاع أطولها — وكلّها بارتفاعٍ واحد، بلا تجاوز.
// القياس بالخطوط الحقيقية (`loadProjectFonts`).

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/favorites/domain/repositories/favorites_repository.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/product_section.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';

class _NoFavorites implements FavoritesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

/// منتجٌ بسيط، أو بكل سطوره الاختيارية (تقييم وسعر سابق وترويج توصيل).
Product _product(int i, {bool promo = false}) => Product(
  id: 'p$i',
  nameAr: 'منتج $i',
  nameCkb: 'بەرهەمی $i',
  price: 5000,
  images: const [],
  stock: 9,
  rating: promo ? 4.5 : null,
  previousPrice: promo ? 6000 : null,
  discountPercent: promo ? 17 : null,
  hasDeliveryPromo: promo,
  deliveryPromoAmount: promo ? 2000 : 0,
);

Future<List<FlutterErrorDetails>> _pump(
  WidgetTester tester,
  Widget child, {
  AppLanguage language = AppLanguage.arabic,
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final errors = <FlutterErrorDetails>[];
  final previous = FlutterError.onError;
  FlutterError.onError = errors.add;
  try {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: LocaleScope(
          language: language,
          child: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(textScale)),
              child: BlocProvider<FavoritesCubit>(
                create: (_) => FavoritesCubit(repository: _NoFavorites()),
                child: Directionality(
                  textDirection: TextDirection.rtl,
                  child: Scaffold(body: SingleChildScrollView(child: child)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  } finally {
    FlutterError.onError = previous;
  }
  return errors;
}

/// ارتفاع بطاقةٍ وحدها بعرض الصفّ — ما يحتاجه محتواها.
Future<double> _natural(
  WidgetTester tester,
  Product product,
  double textScale,
) async {
  await _pump(
    tester,
    Align(
      alignment: Alignment.topCenter,
      child: SizedBox(
        width: ProductSection.cardWidth,
        child: AnimeProductCard(product: product, onFavoriteToggle: () {}),
      ),
    ),
    textScale: textScale,
  );
  return tester.getSize(find.byType(AnimeProductCard)).height;
}

Future<double> _rail(
  WidgetTester tester,
  List<Product> products, {
  AppLanguage language = AppLanguage.arabic,
  double textScale = 1,
}) async {
  final errors = await _pump(
    tester,
    ProductSection(title: 'عروض', products: products),
    language: language,
    textScale: textScale,
  );
  expect(
    errors,
    isEmpty,
    reason: 'تجاوزٌ في بطاقة: ${errors.map((e) => e.exceptionAsString())}',
  );
  final heights = {
    for (final card in tester.widgetList(find.byType(AnimeProductCard)))
      tester.getSize(find.byWidget(card)).height,
  };
  expect(heights, hasLength(1), reason: 'البطاقات بارتفاعٍ واحد');
  return heights.single;
}

void main() {
  setUpAll(loadProjectFonts);

  final plain = [for (var i = 0; i < 3; i++) _product(i)];
  final mixed = [_product(0), _product(1, promo: true), _product(2)];

  testWidgets('بطاقاتٌ بسيطة عند ١٫٠: ٢٤٦ المصمَّم كما هو', (tester) async {
    expect(await _rail(tester, plain), ProductSection.designHeight);
  });

  for (final scale in [1.0, 1.3]) {
    testWidgets(
      '×$scale: بطاقةٌ بترويج — الصفّ بارتفاعها، والبقية مثلها، بلا تجاوز',
      (tester) async {
        final natural = await _natural(tester, _product(1, promo: true), scale);
        expect(natural, greaterThan(ProductSection.designHeight));
        expect(
          await _rail(tester, mixed, textScale: scale),
          closeTo(natural, 0.01),
        );
      },
    );
  }

  testWidgets('×1.3: بطاقاتٌ بسيطة أطول من ٢٤٦ — الصفّ يطول معها، بلا تجاوز', (
    tester,
  ) async {
    final natural = await _natural(tester, _product(0), 1.3);
    expect(natural, greaterThan(ProductSection.designHeight));
    expect(await _rail(tester, plain, textScale: 1.3), closeTo(natural, 0.01));
  });

  for (final scale in [1.0, 1.3]) {
    testWidgets('×$scale: الارتفاع واحدٌ باللغتين', (tester) async {
      final arabic = await _rail(tester, mixed, textScale: scale);
      final kurdish = await _rail(
        tester,
        mixed,
        language: AppLanguage.kurdish,
        textScale: scale,
      );
      expect(kurdish, arabic);
    });
  }
}
