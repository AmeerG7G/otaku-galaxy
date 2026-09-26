// حالة توفّر المنتج — «متوفر» / «قريباً يتوفر» / «نفد المخزون».
//
// [CRITICAL] القاعدة التي تحرسها هذه الاختبارات كلها: **المخزون هو مصدر
// الحقيقة، لا التاريخ.** `restockAt` موعدٌ متوقَّع إرشادي؛ لا يفتح شراءً ولا
// يمنعه، ولا يبقى معروضاً لحظةَ وصول البضاعة. الحساب في مكان واحد
// (`Product.availability`) حتى لا تقول البطاقة شيئاً وتقول التفاصيل غيره.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/glossary.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';

Product _product({int stock = 0, DateTime? restockAt}) => Product(
  id: 'p1',
  name: 'مجسم ون بيس',
  price: 25000,
  description: 'وصف',
  images: const [],
  stock: stock,
  restockAt: restockAt,
);

final _future = DateTime(2026, 10, 15);

Future<void> _pumpPill(WidgetTester tester, Product product) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: ProductStockPill.forProduct(product)),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('الحساب الوحيد للتوفر', () {
    test('مخزون موجب ⇒ متوفر', () {
      expect(_product(stock: 3).availability, ProductAvailability.available);
    });

    test('[CRITICAL] مخزون صفر مع موعد ⇒ قريباً يتوفر', () {
      expect(
        _product(stock: 0, restockAt: _future).availability,
        ProductAvailability.comingSoon,
      );
    });

    test('مخزون صفر بلا موعد ⇒ غير متوفر', () {
      expect(
        _product(stock: 0).availability,
        ProductAvailability.unavailable,
      );
    });

    test('[CRITICAL] مخزون موجب **مع** موعد ⇒ متوفر لا قريباً', () {
      // السيناريو الحاسم: وصلت البضاعة قبل الموعد ولم يمسح المسؤول التاريخ.
      final product = _product(stock: 3, restockAt: _future);
      expect(product.availability, ProductAvailability.available);
      expect(product.availability.canAddToCart, isTrue);
    });

    test('[CRITICAL] الموعد لا يُعرض على منتج متوفر', () {
      expect(_product(stock: 3, restockAt: _future).displayRestockAt, isNull);
      expect(
        _product(stock: 0, restockAt: _future).displayRestockAt,
        _future,
      );
      expect(_product(stock: 0).displayRestockAt, isNull);
    });

    test('الموعد الماضي لا يغيّر الحالة — المخزون وحده يقرّر', () {
      // موعدٌ مضى ولم تصل بضاعة: المنتج ما زال منتظَراً لا متوفراً.
      final past = _product(stock: 0, restockAt: DateTime(2020, 1, 1));
      expect(past.availability, ProductAvailability.comingSoon);
      expect(past.availability.canAddToCart, isFalse);
    });

    test('الإضافة إلى السلة مسموحة في الحالة المتوفرة وحدها', () {
      expect(ProductAvailability.available.canAddToCart, isTrue);
      expect(ProductAvailability.comingSoon.canAddToCart, isFalse);
      expect(ProductAvailability.unavailable.canAddToCart, isFalse);
    });

    test('إجراء «أخبرني» يظهر في الحالتين غير المتوفرتين', () {
      expect(ProductAvailability.comingSoon.showsRestockAction, isTrue);
      expect(ProductAvailability.unavailable.showsRestockAction, isTrue);
      expect(ProductAvailability.available.showsRestockAction, isFalse);
    });
  });

  group('تحليل الموعد من الخادم', () {
    test('ISO-8601 يُقرأ موعداً', () {
      final p = Product.fromJson({
        'id': 'p1',
        'name': 'منتج',
        'stock': 0,
        'restockAt': '2026-10-15T00:00:00.000Z',
      });
      expect(p.restockAt, isNotNull);
      expect(p.availability, ProductAvailability.comingSoon);
    });

    test('غياب الحقل أو null ⇒ بلا موعد', () {
      for (final json in [
        {'id': 'p1', 'name': 'م', 'stock': 0},
        {'id': 'p1', 'name': 'م', 'stock': 0, 'restockAt': null},
      ]) {
        final p = Product.fromJson(json);
        expect(p.restockAt, isNull);
        expect(p.availability, ProductAvailability.unavailable);
      }
    });

    test('[CRITICAL] نصّ معطوب لا يُسقط الصفحة', () {
      final p = Product.fromJson({
        'id': 'p1',
        'name': 'م',
        'stock': 0,
        'restockAt': 'ليس تاريخاً',
      });
      expect(p.restockAt, isNull);
      expect(p.availability, ProductAvailability.unavailable);
    });
  });

  group('شارة الحالة على الشاشة', () {
    testWidgets('[CRITICAL] صفر + موعد ⇒ «قريباً يتوفر» لا «نفد المخزون»', (
      tester,
    ) async {
      await _pumpPill(tester, _product(stock: 0, restockAt: _future));
      expect(find.text(Glossary.comingSoon.ar), findsOneWidget);
      expect(find.text('نفد المخزون'), findsNothing);
    });

    testWidgets('صفر بلا موعد ⇒ «نفد المخزون»', (tester) async {
      await _pumpPill(tester, _product(stock: 0));
      expect(find.text('نفد المخزون'), findsOneWidget);
      expect(find.text(Glossary.comingSoon.ar), findsNothing);
    });

    testWidgets('[CRITICAL] مخزون موجب ⇒ لا أثر لـ«قريباً يتوفر»', (
      tester,
    ) async {
      await _pumpPill(tester, _product(stock: 9, restockAt: _future));
      expect(find.text('متوفر'), findsOneWidget);
      expect(find.text(Glossary.comingSoon.ar), findsNothing);
    });

    testWidgets('[CRITICAL] الانتقال ٠ ← ٣ يُبدّل الشارة فوراً', (tester) async {
      await _pumpPill(tester, _product(stock: 0, restockAt: _future));
      expect(find.text(Glossary.comingSoon.ar), findsOneWidget);

      // المسؤول يستلم البضاعة قبل الموعد.
      await _pumpPill(tester, _product(stock: 3, restockAt: _future));
      expect(find.text(Glossary.comingSoon.ar), findsNothing);
      expect(find.textContaining('آخر'), findsOneWidget); // آخر ٣ قطع
    });

    testWidgets('النصّ من المسرد لا من نصٍّ مكتوب في الشاشة', (tester) async {
      // يمنع تباعد الصياغة عن `Glossary.comingSoon`.
      await _pumpPill(tester, _product(stock: 0, restockAt: _future));
      expect(find.text('قريباً يتوفر'), findsOneWidget);
      expect(Glossary.comingSoon.ar, 'قريباً يتوفر');
    });
  });

  group('[CRITICAL] لا حالتان متناقضتان في بطاقة واحدة', () {
    Future<void> pumpCard(WidgetTester tester, Product product) async {
      tester.view.physicalSize = const Size(400, 900);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: SizedBox(
                width: 200,
                height: 320,
                child: AnimeProductCard(product: product),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('المنتظَر بموعد لا يحمل شارة «نفد» ولا شريطها', (tester) async {
      // العطب: البطاقة كانت تقول «قريباً يتوفر» في شارتها و«نفد المخزون»
      // فوق صورتها في آنٍ واحد.
      await pumpCard(tester, _product(stock: 0, restockAt: _future));
      expect(find.text('نفد المخزون'), findsNothing);
      expect(find.text(Glossary.comingSoon.ar), findsWidgets);
    });

    testWidgets('المنتج بلا موعد يحتفظ بشريط النفاد كما كان', (tester) async {
      await pumpCard(tester, _product(stock: 0));
      expect(find.text('نفد المخزون'), findsWidgets);
      expect(find.text(Glossary.comingSoon.ar), findsNothing);
    });

    testWidgets('المتوفر بلا شارة نفاد ولا انتظار', (tester) async {
      await pumpCard(tester, _product(stock: 5, restockAt: _future));
      expect(find.text('نفد المخزون'), findsNothing);
      expect(find.text(Glossary.comingSoon.ar), findsNothing);
    });
  });

  group('مفتاح الترجمة موجود في اللغتين', () {
    test('comingSoon و expectedRestockOn معرَّفان', () {
      for (final key in ['comingSoon', 'expectedRestockOn']) {
        expect(AppStrings.keys, contains(key), reason: '$key عربي');
        expect(
          AppStrings.translatedKeys,
          contains(key),
          reason: '$key سوراني',
        );
      }
    });
  });
}
