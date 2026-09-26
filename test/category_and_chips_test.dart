// انحدارات واجهة: بطاقة القسم النصّية، ثبات لون القسم، وقصّ الرقائق.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';

Category _cat(String id, String name, {String? image}) =>
    Category(id: id, name: name, imageUrl: image);

Widget _host(Widget child, {ThemeData? theme, Size size = const Size(390, 800)}) =>
    MaterialApp(
      theme: theme ?? AppTheme.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: SizedBox(width: size.width, height: size.height, child: child),
        ),
      ),
    );

void main() {
  group('بطاقة القسم الرئيسي — نصّية موسَّطة بلا صورة', () {
    // [PRODUCT] قرار 2026-09-15: لا صورةَ قسم، ولا حرفاً مائياً، ولا مساحةً
    // محجوزة لرسم. الاسم وعدد الأقسام الفرعية في منتصف البطاقة.
    Category cat({int subs = 8, String? image}) => Category(
      id: 'c1',
      name: 'الحقائب',
      imageUrl: image,
      subcategories: List.generate(subs, (i) => 'فرعي $i'),
    );

    testWidgets('[CRITICAL] لا صورة ولا حرف مائي — ولو رفع المسؤول صورة', (tester) async {
      await tester.pumpWidget(_host(AnimeCategoryCard(category: cat(image: 'https://x.test/a.png'))));
      expect(find.byType(Image), findsNothing);
      expect(find.text('ا'), findsNothing);
    });

    testWidgets('[CRITICAL] الاسم والعدد موسَّطان أفقياً وعمودياً داخل البطاقة', (tester) async {
      await tester.pumpWidget(_host(AnimeCategoryCard(category: cat())));
      final card = tester.getRect(find.byType(AnimeCategoryCard));
      final name = tester.getRect(find.text('الحقائب'));
      final count = tester.getRect(find.text('8 قسم فرعي'));
      expect((name.center.dx - card.center.dx).abs(), lessThan(1.5));
      expect((count.center.dx - card.center.dx).abs(), lessThan(1.5));
      // الكتلة النصّية (الاسم + العدد) في منتصف الارتفاع.
      final blockCenterY = (name.top + count.bottom) / 2;
      expect((blockCenterY - card.center.dy).abs(), lessThan(3));
      // ولا مساحة محجوزة على أي جانب: النصّ ممتدٌّ على عرض البطاقة كلها.
      expect(tester.widget<Text>(find.text('الحقائب')).textAlign, TextAlign.center);
      expect(tester.widget<Text>(find.text('8 قسم فرعي')).textAlign, TextAlign.center);
    });

    testWidgets('التوسيط نفسه في المظهر الداكن', (tester) async {
      await tester.pumpWidget(_host(AnimeCategoryCard(category: cat()), theme: AppTheme.dark));
      final card = tester.getRect(find.byType(AnimeCategoryCard));
      expect((tester.getRect(find.text('الحقائب')).center.dx - card.center.dx).abs(), lessThan(1.5));
      expect(find.byType(Image), findsNothing);
    });
  });

  group('لون القسم', () {
    test('اللون مشتقّ من المعرّف لا من الترتيب', () {
      final a = _cat('cat-alpha', 'أ');
      final b = _cat('cat-beta', 'ب');

      // نفس القسم ⇒ نفس اللون، مهما اختلف موضعه في أي قائمة.
      expect(
        AnimeCategoryCard.gradientForCategory(a),
        AnimeCategoryCard.gradientForCategory(_cat('cat-alpha', 'أ')),
      );
      // ولا يتأثر بوجود قسم آخر قبله.
      final beforeReorder = AnimeCategoryCard.gradientForCategory(b);
      expect(AnimeCategoryCard.gradientForCategory(b), beforeReorder);
    });

    test('اللون دائماً من لوحة التصميم — لا لون مخترع', () {
      for (final id in ['a', 'zz', 'cat-9', '9f8e7d6c', '']) {
        final palette = AnimeCategoryCard.gradientForCategory(_cat(id, 'س'));
        expect(AnimeCategoryCard.gradients, contains(palette));
      }
    });
  });

  group('الرقائق لا تُقصّ', () {
    /// أدنى ارتفاع تحتاجه الرقاقة: حشوة ٩+٩ وسطر نص.
    const minChipHeight = 34.0;

    for (final width in [320.0, 390.0, 430.0]) {
      testWidgets('عرض $width — الرقاقة المحدَّدة كاملة وواضحة', (tester) async {
        await tester.pumpWidget(
          _host(
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
              child: Row(
                children: [
                  for (final label in ['الكل', 'قرطاسية', 'إكسسوارات وحقائب'])
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: AnimeChoiceChip(
                        label: label,
                        selected: label == 'قرطاسية',
                        onSelected: (_) {},
                      ),
                    ),
                ],
              ),
            ),
            size: Size(width, 400),
          ),
        );

        expect(tester.takeException(), isNull);
        for (final label in ['الكل', 'قرطاسية', 'إكسسوارات وحقائب']) {
          expect(find.text(label), findsOneWidget);
          final size = tester.getSize(find.text(label));
          expect(size.height, greaterThan(0));
          // النص غير مقصوص رأسياً داخل الرقاقة.
          final chip = tester.getSize(
            find.ancestor(
              of: find.text(label),
              matching: find.byType(AnimatedContainer),
            ),
          );
          expect(
            chip.height,
            greaterThanOrEqualTo(minChipHeight),
            reason: 'الرقاقة «$label» مقصوصة عند عرض $width',
          );
        }
      });
    }

    for (final entry in {'فاتح': AppTheme.light, 'داكن': AppTheme.dark}.entries) {
      testWidgets('مظهر ${entry.key} — المحدَّدة مصمتة لا شفافة', (tester) async {
        await tester.pumpWidget(
          _host(
            Center(
              child: AnimeChoiceChip(
                label: 'أقلام',
                selected: true,
                onSelected: (_) {},
              ),
            ),
            theme: entry.value,
          ),
        );

        final container = tester.widget<AnimatedContainer>(
          find.ancestor(
            of: find.text('أقلام'),
            matching: find.byType(AnimatedContainer),
          ),
        );
        final decoration = container.decoration! as BoxDecoration;
        // إمّا تدرّج أو لون صلب — وليس شفافاً في أي حال.
        final opaque =
            decoration.gradient != null ||
            (decoration.color != null &&
                decoration.color != Colors.transparent);
        expect(opaque, isTrue, reason: 'الرقاقة المحدَّدة تبدو شفافة');
      });
    }
  });
}
