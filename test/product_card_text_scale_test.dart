// [CRITICAL] اسم المنتج في البطاقة يحجز سطرين بمقياس الخطّ (البوّابة ١٣، 2026-10-12).
//
// كان صندوق الاسم ٣٦ ثابتاً — سطران عند ١٫٠ — فيُقصّ السطر الثاني لاسمٍ
// طويل عند ×١٫٣ (يحتاج ٤٦) بالعربية والكردية معاً. العقد: عند ١٫٠ كما كان،
// وعند ×١٫٣ يتّسع الصندوق لسطرين كاملين. القياس بالخطوط الحقيقية.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';

const _product = Product(
  id: 'p',
  nameAr: 'مجسّم لوفي من ون بيس بإصدار خاص محدود',
  nameCkb: 'پەیکەری لووفی لە وەن پیس بە دەرچوونی تایبەت',
  price: 25000,
  images: [],
  stock: 9,
);

Future<RenderParagraph> _name(
  WidgetTester tester,
  AppLanguage language,
  double textScale,
) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: LocaleScope(
        language: language,
        child: MediaQuery(
          data: MediaQueryData(
            size: const Size(412, 892),
            textScaler: TextScaler.linear(textScale),
          ),
          child: const Directionality(
            textDirection: TextDirection.rtl,
            child: Material(
              child: Align(
                alignment: Alignment.topCenter,
                child: SizedBox(
                  width: 158,
                  child: AnimeProductCard(product: _product),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return tester.renderObject<RenderParagraph>(
    find.text(localizedProductName(_product, language)),
  );
}

void main() {
  setUpAll(loadProjectFonts);

  for (final language in AppLanguage.values) {
    testWidgets('${language.code} ×1.0: صندوق الاسم ٣٦ كما كان، والاسم سطران', (
      tester,
    ) async {
      final name = await _name(tester, language, 1.0);
      expect(name.size.height, 36);
      expect(
        name.getMaxIntrinsicHeight(name.size.width),
        lessThanOrEqualTo(36),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('${language.code} ×1.3: السطر الثاني كاملٌ لا مقصوص', (
      tester,
    ) async {
      final name = await _name(tester, language, 1.3);
      final needed = name.getMaxIntrinsicHeight(name.size.width);
      expect(needed, greaterThan(36), reason: 'اسمٌ من سطرين عند ×١٫٣');
      expect(name.size.height, greaterThanOrEqualTo(needed - 0.5));
      expect(tester.takeException(), isNull);
    });
  }
}
